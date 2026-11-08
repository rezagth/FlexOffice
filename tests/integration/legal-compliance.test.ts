import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * Conformité juridique contre une vraie base : CGV partenaires et mandat de
 * facturation, droit sur le lieu, signalement d'annonce, identité fiscale
 * DAC7 et son export. Les e-mails passent par un fournisseur d'enregistrement.
 */

const sent = vi.hoisted(() => [] as Array<{ to: string; subject: string; text: string }>);

vi.mock("@/server/domains/notifications/get-email-provider", () => ({
  getEmailProvider: () => ({
    name: "test",
    send: async (message: { to: string; subject: string; text: string }) => {
      sent.push(message);
      return { id: `test_${sent.length}` };
    },
  }),
}));

describe.skipIf(!hasDatabase)("conformité juridique", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let fixtures: typeof import("./helpers/test-fixtures");
  let errors: typeof import("@/server/lib/errors");
  let legal: typeof import("@/lib/legal-versions");

  let landlordId: string;
  let adminId: string;
  let orgId: string;
  let propertyId: string;
  const users: string[] = [];

  async function draftSpace() {
    return fixtures.createTestSpace(orgId, propertyId, { status: "DRAFT" });
  }

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
    delete process.env.OFFICEFLEX_DEMO_MODE;

    ({ prisma } = await import("@/server/db/prisma"));
    fixtures = await import("./helpers/test-fixtures");
    errors = await import("@/server/lib/errors");
    legal = await import("@/lib/legal-versions");

    const [landlord, admin] = await Promise.all([
      fixtures.createTestUser({ role: "CLIENT", name: "Legal Landlord" }),
      fixtures.createTestUser({ role: "CLIENT", name: "Legal Admin" }),
    ]);
    landlordId = landlord.id;
    adminId = admin.id;
    users.push(landlordId, adminId);
    await prisma.profile.update({ where: { id: adminId }, data: { platformRole: "ADMIN" } });

    const org = await fixtures.createTestOrganization({ name: "Legal Org" });
    orgId = org.id;
    await prisma.organization.update({ where: { id: orgId }, data: { status: "VERIFIED" } });
    await prisma.organizationMember.create({ data: { organizationId: orgId, profileId: landlordId, orgRole: "OWNER" } });
    propertyId = (await fixtures.createTestProperty(orgId, landlordId)).id;
  });

  beforeEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.contentReport.deleteMany({ where: { space: { organizationId: orgId } } }).catch(() => undefined);
    await prisma.space.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
    await prisma.payoutLine.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
    await prisma.payout.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
    await prisma.booking.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
    for (const id of users) await fixtures.deleteTestUser(id).catch(() => undefined);
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
  });

  describe("CGV partenaires et droit sur le lieu à la soumission", () => {
    it("refuse sans la case CGV tant que l'organisation ne les a pas acceptées", async () => {
      const { submitSpaceForReview } = await import("@/server/domains/organizations/submit-space");
      const space = await draftSpace();
      await expect(
        submitSpaceForReview(orgId, space.id, landlordId, { certifyRightToLet: true })
      ).rejects.toBeInstanceOf(errors.LegalAcceptanceRequiredError);
      const after = await prisma.space.findUnique({ where: { id: space.id } });
      expect(after?.status).toBe("DRAFT");
    });

    it("refuse sans certification du droit sur le lieu, même si les CGV sont cochées", async () => {
      const { submitSpaceForReview } = await import("@/server/domains/organizations/submit-space");
      const space = await draftSpace();
      await expect(
        submitSpaceForReview(orgId, space.id, landlordId, { acceptPartnerTerms: true })
      ).rejects.toBeInstanceOf(errors.LegalAcceptanceRequiredError);
      expect((await prisma.space.findUnique({ where: { id: space.id } }))?.status).toBe("DRAFT");
    });

    it("refuse une case simplement truthy : seule la valeur true compte", async () => {
      const { submitSpaceForReview } = await import("@/server/domains/organizations/submit-space");
      const space = await draftSpace();
      await expect(
        submitSpaceForReview(orgId, space.id, landlordId, {
          acceptPartnerTerms: "true" as unknown as boolean,
          certifyRightToLet: 1 as unknown as boolean,
        })
      ).rejects.toBeInstanceOf(errors.LegalAcceptanceRequiredError);
    });

    it("avec les deux cases : passe en PENDING_REVIEW et enregistre date, version et auteur", async () => {
      const { submitSpaceForReview } = await import("@/server/domains/organizations/submit-space");
      const space = await draftSpace();
      await submitSpaceForReview(orgId, space.id, landlordId, { acceptPartnerTerms: true, certifyRightToLet: true });

      const savedSpace = await prisma.space.findUnique({ where: { id: space.id } });
      expect(savedSpace?.status).toBe("PENDING_REVIEW");
      expect(savedSpace?.rightToLetCertifiedAt).toBeInstanceOf(Date);
      expect(savedSpace?.rightToLetCertifiedByProfileId).toBe(landlordId);

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      expect(org?.partnerTermsVersion).toBe(legal.PARTNER_TERMS_VERSION);
      expect(org?.partnerTermsAcceptedAt).toBeInstanceOf(Date);
      expect(org?.partnerTermsAcceptedByProfileId).toBe(landlordId);

      const audits = await prisma.auditLog.findMany({
        where: { organizationId: orgId, event: { in: ["organization.partner_terms_accepted", "space.submitted"] } },
      });
      expect(audits.map((a) => a.event)).toEqual(expect.arrayContaining(["organization.partner_terms_accepted", "space.submitted"]));
    });

    it("une fois les CGV acceptées, une 2e soumission n'a plus à les recocher mais doit re-certifier le lieu", async () => {
      const { submitSpaceForReview, organizationNeedsPartnerTerms } = await import(
        "@/server/domains/organizations/submit-space"
      );
      expect(await organizationNeedsPartnerTerms(orgId)).toBe(false);
      const space = await draftSpace();
      await expect(submitSpaceForReview(orgId, space.id, landlordId, {})).rejects.toBeInstanceOf(
        errors.LegalAcceptanceRequiredError
      );
      await submitSpaceForReview(orgId, space.id, landlordId, { certifyRightToLet: true });
      expect((await prisma.space.findUnique({ where: { id: space.id } }))?.status).toBe("PENDING_REVIEW");
    });

    it("une nouvelle version des CGV redemande l'acceptation", async () => {
      const { submitSpaceForReview, organizationNeedsPartnerTerms } = await import(
        "@/server/domains/organizations/submit-space"
      );
      await prisma.organization.update({ where: { id: orgId }, data: { partnerTermsVersion: "1999-01-01" } });
      expect(await organizationNeedsPartnerTerms(orgId)).toBe(true);
      const space = await draftSpace();
      await expect(
        submitSpaceForReview(orgId, space.id, landlordId, { certifyRightToLet: true })
      ).rejects.toBeInstanceOf(errors.LegalAcceptanceRequiredError);
      await submitSpaceForReview(orgId, space.id, landlordId, { acceptPartnerTerms: true, certifyRightToLet: true });
      expect((await prisma.organization.findUnique({ where: { id: orgId } }))?.partnerTermsVersion).toBe(
        legal.PARTNER_TERMS_VERSION
      );
    });

    it("une double soumission est un conflit, pas une seconde transition", async () => {
      const { submitSpaceForReview } = await import("@/server/domains/organizations/submit-space");
      const space = await draftSpace();
      await submitSpaceForReview(orgId, space.id, landlordId, { certifyRightToLet: true });
      await expect(
        submitSpaceForReview(orgId, space.id, landlordId, { certifyRightToLet: true })
      ).rejects.toBeInstanceOf(errors.ConflictError);
    });

    it("on ne peut pas soumettre l'espace d'une autre organisation", async () => {
      const { submitSpaceForReview } = await import("@/server/domains/organizations/submit-space");
      const other = await fixtures.createTestOrganization({ name: "Other Org" });
      try {
        const space = await draftSpace();
        await expect(
          submitSpaceForReview(other.id, space.id, landlordId, { acceptPartnerTerms: true, certifyRightToLet: true })
        ).rejects.toBeInstanceOf(errors.NotFoundError);
      } finally {
        await prisma.organization.delete({ where: { id: other.id } }).catch(() => undefined);
      }
    });

    it("la base refuse une acceptation à moitié renseignée (date sans version)", async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE organizations SET partner_terms_accepted_at = now(), partner_terms_version = NULL WHERE id = $1::uuid`,
          orgId
        )
      ).rejects.toThrow();
    });
  });

  describe("signalement d'une annonce", () => {
    const input = { reason: "ILLEGAL" as const, message: "Cette annonce est manifestement frauduleuse." };

    async function publishedSpace() {
      return fixtures.createTestSpace(orgId, propertyId, { status: "PUBLISHED" });
    }

    it("crée un signalement PENDING sur un espace publié, avec trace d'audit", async () => {
      const { createContentReport } = await import("@/server/domains/reports/reports");
      const space = await publishedSpace();
      const { id } = await createContentReport(space.slug, input, null);
      const report = await prisma.contentReport.findUnique({ where: { id } });
      expect(report?.status).toBe("PENDING");
      expect(report?.reporterProfileId).toBeNull();
      expect(report?.spaceId).toBe(space.id);
      const audit = await prisma.auditLog.findFirst({ where: { event: "space.reported", organizationId: orgId }, orderBy: { createdAt: "desc" } });
      expect(audit?.metadata).toMatchObject({ reportId: id, spaceId: space.id });
    });

    it("refuse de signaler un espace inexistant, brouillon ou archivé", async () => {
      const { createContentReport } = await import("@/server/domains/reports/reports");
      await expect(createContentReport("slug-qui-n-existe-pas", input, null)).rejects.toBeInstanceOf(errors.NotFoundError);
      const draft = await draftSpace();
      await expect(createContentReport(draft.slug, input, null)).rejects.toBeInstanceOf(errors.NotFoundError);
    });

    it("masquer l'espace : dépublié, bailleur prévenu avec le motif, tous les signalements clos", async () => {
      const { createContentReport, actOnReportBySpaceHide } = await import("@/server/domains/reports/reports");
      const space = await publishedSpace();
      const first = await createContentReport(space.slug, input, null);
      const second = await createContentReport(space.slug, { ...input, reason: "INACCURATE" }, landlordId);

      await actOnReportBySpaceHide(adminId, first.id, "Annonce frauduleuse confirmée");

      expect((await prisma.space.findUnique({ where: { id: space.id } }))?.status).not.toBe("PUBLISHED");
      const reports = await prisma.contentReport.findMany({ where: { id: { in: [first.id, second.id] } } });
      expect(reports.every((r) => r.status === "ACTIONED")).toBe(true);
      expect(reports.every((r) => r.handledByProfileId === adminId)).toBe(true);
      expect(sent.some((m) => m.text.includes("Annonce frauduleuse confirmée"))).toBe(true);
    });

    it("classer sans suite : le signalement est DISMISSED et l'espace reste publié", async () => {
      const { createContentReport, dismissReport } = await import("@/server/domains/reports/reports");
      const space = await publishedSpace();
      const { id } = await createContentReport(space.slug, input, null);
      await dismissReport(adminId, id, "Aucun élément probant");
      const report = await prisma.contentReport.findUnique({ where: { id } });
      expect(report?.status).toBe("DISMISSED");
      expect(report?.resolution).toBe("Aucun élément probant");
      expect((await prisma.space.findUnique({ where: { id: space.id } }))?.status).toBe("PUBLISHED");
    });

    it("un signalement déjà traité ne peut pas l'être deux fois", async () => {
      const { createContentReport, dismissReport, actOnReportBySpaceHide } = await import("@/server/domains/reports/reports");
      const space = await publishedSpace();
      const { id } = await createContentReport(space.slug, input, null);
      await dismissReport(adminId, id);
      await expect(dismissReport(adminId, id)).rejects.toBeInstanceOf(errors.ConflictError);
      await expect(actOnReportBySpaceHide(adminId, id, "Motif")).rejects.toBeInstanceOf(errors.ConflictError);
    });

    it("traiter un signalement inconnu → introuvable", async () => {
      const { dismissReport } = await import("@/server/domains/reports/reports");
      await expect(dismissReport(adminId, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
        errors.NotFoundError
      );
    });
  });

  describe("identité fiscale DAC7", () => {
    it("enregistre le pays, le numéro fiscal et la date de naissance", async () => {
      const { saveTaxInfo } = await import("@/server/domains/organizations/tax-info");
      await saveTaxInfo(orgId, landlordId, {
        taxResidenceCountry: "FR",
        taxIdentificationNumber: "1234567890123",
        representativeBirthDate: "1985-07-04",
      });
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      expect(org?.taxResidenceCountry).toBe("FR");
      expect(org?.taxIdentificationNumber).toBe("1234567890123");
      expect(org?.representativeBirthDate?.toISOString().slice(0, 10)).toBe("1985-07-04");
    });

    it("n'écrit pas les valeurs fiscales dans le journal d'audit", async () => {
      const { saveTaxInfo } = await import("@/server/domains/organizations/tax-info");
      await saveTaxInfo(orgId, landlordId, { taxResidenceCountry: "FR", taxIdentificationNumber: "SECRET-TIN-999" });
      const audit = await prisma.auditLog.findFirst({
        where: { event: "organization.tax_info_updated", organizationId: orgId },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).not.toBeNull();
      expect(JSON.stringify(audit)).not.toContain("SECRET-TIN-999");
    });

    it("effacer le numéro fiscal et la date remet les champs à nul", async () => {
      const { saveTaxInfo } = await import("@/server/domains/organizations/tax-info");
      await saveTaxInfo(orgId, landlordId, { taxResidenceCountry: "FR" });
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      expect(org?.taxIdentificationNumber).toBeNull();
      expect(org?.representativeBirthDate).toBeNull();
    });

    it("l'export DAC7 de l'année contient les versements payés de l'organisation, au bon trimestre", async () => {
      const { buildDac7Csv } = await import("@/server/domains/organizations/dac7-export");
      const year = 2031; // année isolée : aucune autre donnée de test dans ce créneau
      const client = await fixtures.createTestUser({ role: "CLIENT", name: "DAC7 Client" });
      users.push(client.id);
      const space = await fixtures.createTestSpace(orgId, propertyId, { status: "PUBLISHED" });
      const booking = await prisma.booking.create({
        data: {
          spaceId: space.id,
          organizationId: orgId,
          clientUserId: client.id,
          startsAt: new Date(`${year}-05-10T09:00:00Z`),
          endsAt: new Date(`${year}-05-10T17:00:00Z`),
          status: "COMPLETED",
          participantsCount: 2,
          purpose: "DAC7",
          priceAmountCents: 10000,
          originalPriceAmountCents: 10000,
          commissionAmountCents: 1500,
        },
      });
      const payout = await prisma.payout.create({
        data: {
          organizationId: orgId,
          scheduledFor: new Date(`${year}-05-19T22:00:00Z`),
          status: "PAID",
          paidAt: new Date(`${year}-05-20T10:00:00Z`),
          amountCents: 8500,
        },
      });
      await prisma.payoutLine.create({
        data: {
          organizationId: orgId,
          payoutId: payout.id,
          bookingId: booking.id,
          kind: "EARNING",
          amountCents: 8500,
          eligibleAt: new Date(`${year}-05-17T00:00:00Z`),
        },
      });

      const csv = await buildDac7Csv(year);
      const row = csv.split("\r\n").find((line) => line.includes("Legal Org"));
      expect(row).toBeDefined();
      expect(row).toContain('"T2"');
      expect(row).toContain('"85.00"');

      const other = await buildDac7Csv(year + 1);
      expect(other).not.toContain("Legal Org");
    });
  });
});
