import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * SEC-10 / FCT-19 — erasure, export and retention, against the real schema
 * (FKs, CHECK constraints, cascades). Supabase Auth and Storage are stubbed:
 * what is under test is which rows change and which objects are asked to be
 * removed, not GoTrue itself.
 */
const deleteUser = vi.fn();
const updateUserById = vi.fn();
const getUserById = vi.fn();
const storageRemove = vi.fn();
const verifyCurrentPassword = vi.fn();

vi.mock("@/server/auth/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { deleteUser, updateUserById, getUserById } },
    storage: { from: () => ({ remove: storageRemove }) },
  }),
}));

vi.mock("@/server/domains/users/reauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/domains/users/reauth")>();
  return {
    ...actual,
    verifyCurrentPassword,
    assertCurrentPassword: async (email: string, password: string) => {
      if (!(await verifyCurrentPassword(email, password))) throw new actual.InvalidCurrentPasswordError();
    },
  };
});

describe.skipIf(!hasDatabase)("GDPR erasure, export and retention", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let gdpr: typeof import("@/server/domains/users/gdpr");
  let retention: typeof import("@/server/domains/users/retention");
  let fixtures: typeof import("./helpers/test-fixtures");

  const userIds: string[] = [];
  const orgIds: string[] = [];

  let landlordId: string;
  let orgId: string;
  let spaceId: string;
  let propertyId: string;

  async function user(name: string) {
    const created = await fixtures.createTestUser({ role: "CLIENT", name, phone: "0600000000" });
    userIds.push(created.id);
    return created;
  }

  async function booking(clientUserId: string, data: { startsAt: Date; endsAt: Date; status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "AWAITING_PAYMENT" }) {
    return prisma.booking.create({
      data: {
        spaceId,
        organizationId: orgId,
        clientUserId,
        participantsCount: 2,
        purpose: "Test RGPD",
        priceAmountCents: 9000,
        commissionAmountCents: 1350,
        ...data,
      },
    });
  }

  /** An organization with one verification dossier holding one document. */
  async function orgWithKyc(ownerId: string, reviewed?: { status: "APPROVED" | "REJECTED" | "DRAFT"; reviewedAt: Date | null }) {
    const org = await fixtures.createTestOrganization();
    orgIds.push(org.id);
    await prisma.organizationMember.create({
      data: { organizationId: org.id, profileId: ownerId, orgRole: "OWNER", status: "ACTIVE" },
    });
    const verification = await prisma.landlordVerification.create({
      data: {
        organizationId: org.id,
        requestedByProfileId: ownerId,
        activityType: "OWNER",
        status: reviewed?.status ?? "DRAFT",
        reviewedAt: reviewed?.reviewedAt ?? null,
        rejectionReason: reviewed?.status === "REJECTED" ? "Pièce illisible" : null,
      },
    });
    const document = await prisma.verificationDocument.create({
      data: {
        verificationId: verification.id,
        type: "IDENTITY_DOCUMENT",
        storagePath: `${org.id}/${verification.id}/${crypto.randomUUID()}.pdf`,
        originalFilename: "CNI_Jean_Dupont.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1234,
        uploadedByProfileId: ownerId,
      },
    });
    return { org, verification, document };
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    gdpr = await import("@/server/domains/users/gdpr");
    retention = await import("@/server/domains/users/retention");
    fixtures = await import("./helpers/test-fixtures");

    landlordId = (await user("Bailleur RGPD")).id;
    const org = await fixtures.createTestOrganization();
    orgId = org.id;
    orgIds.push(orgId);
    propertyId = (await fixtures.createTestProperty(orgId, landlordId)).id;
    spaceId = (await fixtures.createTestSpace(orgId, propertyId)).id;
  });

  beforeEach(() => {
    deleteUser.mockReset().mockResolvedValue({ error: null });
    updateUserById.mockReset().mockResolvedValue({ error: null });
    getUserById.mockReset().mockResolvedValue({
      data: { user: { user_metadata: { name: "x", phone: "0600000000", role: "CLIENT", extra: "y" } } },
      error: null,
    });
    storageRemove.mockReset().mockResolvedValue({ data: [], error: null });
    verifyCurrentPassword.mockReset().mockResolvedValue(true);
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = userIds.filter(Boolean);
    const orgs = orgIds.filter(Boolean);
    await prisma.message.deleteMany({ where: { senderUserId: { in: ids } } });
    await prisma.dispute.deleteMany({ where: { raisedByUserId: { in: ids } } });
    await prisma.supportTicket.deleteMany({ where: { OR: [{ userId: { in: ids } }, { email: { endsWith: "@test.officeflex.local" } }] } });
    if (orgs.length > 0) {
      await prisma.payment.deleteMany({ where: { organizationId: { in: orgs } } });
      await prisma.booking.deleteMany({ where: { organizationId: { in: orgs } } });
      await prisma.space.deleteMany({ where: { organizationId: { in: orgs } } });
    }
    if (propertyId) await prisma.property.deleteMany({ where: { id: propertyId } });
    await prisma.landlordVerification.deleteMany({ where: { organizationId: { in: orgs } } });
    await prisma.organizationMember.deleteMany({ where: { organizationId: { in: orgs } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.favorite.deleteMany({ where: { userId: { in: ids } } });
    if (ids.length > 0) {
      await prisma.$executeRawUnsafe(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, ids);
    }
    await prisma.$disconnect();
  });

  describe("refusal while a booking is live (FCT-19)", () => {
    it.each(["PENDING", "CONFIRMED", "AWAITING_PAYMENT"] as const)(
      "refuses with a French 409 while a %s booking is upcoming, changing nothing",
      async (status) => {
        const client = await user(`Client ${status}`);
        const startsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000 + Math.random() * 1e9);
        await booking(client.id, { startsAt, endsAt: new Date(startsAt.getTime() + 3 * 3600 * 1000), status });

        await expect(
          gdpr.deleteOwnAccount({ userId: client.id, email: client.email, password: "pw" })
        ).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/réservation/) });

        const profile = await prisma.profile.findUniqueOrThrow({ where: { id: client.id } });
        expect(profile.deletedAt).toBeNull();
        expect(updateUserById).not.toHaveBeenCalled();
      }
    );

    it("allows erasure once bookings are finished or cancelled", async () => {
      const client = await user("Client terminé");
      const past = new Date("2020-01-06T09:00:00Z");
      await booking(client.id, { startsAt: past, endsAt: new Date(past.getTime() + 3600e3), status: "COMPLETED" });
      const future = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      await booking(client.id, { startsAt: future, endsAt: new Date(future.getTime() + 3600e3), status: "CANCELLED" });

      const result = await gdpr.deleteOwnAccount({ userId: client.id, email: client.email, password: "pw" });
      expect(result.mode).toBe("anonymized");
    });
  });

  it("requires the current password: a wrong one erases nothing (SEC-10)", async () => {
    const client = await user("Client mauvais mdp");
    verifyCurrentPassword.mockResolvedValue(false);

    await expect(
      gdpr.deleteOwnAccount({ userId: client.id, email: client.email, password: "wrong" })
    ).rejects.toMatchObject({ status: 403, code: "INVALID_PASSWORD" });
    expect(verifyCurrentPassword).toHaveBeenCalledWith(client.email, "wrong");
    expect((await prisma.profile.findUniqueOrThrow({ where: { id: client.id } })).deletedAt).toBeNull();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("anonymizes messages, support tickets, auth metadata and the sole owner's KYC files", async () => {
    const client = await user("Client complet");
    const past = new Date("2021-03-01T09:00:00Z");
    const b = await booking(client.id, { startsAt: past, endsAt: new Date(past.getTime() + 3600e3), status: "COMPLETED" });
    const conversation = await prisma.conversation.create({ data: { bookingId: b.id } });
    await prisma.message.create({ data: { conversationId: conversation.id, senderUserId: client.id, body: "Mon numéro : 06 11 22 33 44" } });
    await prisma.message.create({ data: { conversationId: conversation.id, senderUserId: landlordId, body: "Bien reçu" } });
    await prisma.supportTicket.create({ data: { userId: client.id, email: client.email, subject: "Aide", message: "Je suis Jean Dupont" } });
    // Sent signed out, with the same address in another case.
    await prisma.supportTicket.create({ data: { email: client.email.toUpperCase(), subject: "Avant inscription", message: "Bonjour" } });
    const kyc = await orgWithKyc(client.id);

    // A shared organization: another active member still needs its files.
    const shared = await orgWithKyc(client.id);
    const colleague = await user("Collègue");
    await prisma.organizationMember.create({
      data: { organizationId: shared.org.id, profileId: colleague.id, orgRole: "ADMIN", status: "ACTIVE" },
    });

    const result = await gdpr.deleteOwnAccount({ userId: client.id, email: client.email, password: "pw" });
    expect(result.mode).toBe("anonymized");

    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: client.id } });
    expect(profile.phone).toBeNull();
    expect(profile.email).toMatch(/^deleted-.*@officeflex\.invalid$/);

    const messages = await prisma.message.findMany({ where: { conversationId: conversation.id } });
    expect(messages.find((m) => m.senderUserId === client.id)?.body).toBe(gdpr.ERASED_TEXT);
    expect(messages.find((m) => m.senderUserId === landlordId)?.body).toBe("Bien reçu");

    const tickets = await prisma.supportTicket.findMany({ where: { OR: [{ userId: client.id }, { email: profile.email }] } });
    expect(tickets).toHaveLength(2);
    for (const ticket of tickets) {
      expect(ticket.email).toBe(profile.email);
      expect(ticket.message).toBe(gdpr.ERASED_TEXT);
      expect(ticket.subject).toBe(gdpr.ERASED_TEXT);
    }

    // The auth side: tombstone e-mail, every metadata key nulled (the phone
    // given at signup lives there), ban — and no `phone: undefined` no-op.
    const [, authUpdate] = updateUserById.mock.calls[0];
    expect(authUpdate.email).toBe(profile.email);
    expect(authUpdate.user_metadata).toMatchObject({ name: null, phone: null, role: null, extra: null });
    expect(authUpdate.ban_duration).toEqual(expect.any(String));
    expect("phone" in authUpdate).toBe(false);

    // KYC: the sole-owner organization's file is removed and its row marked;
    // the shared organization's file is untouched.
    expect(storageRemove).toHaveBeenCalledWith([kyc.document.storagePath]);
    const purged = await prisma.verificationDocument.findUniqueOrThrow({ where: { id: kyc.document.id } });
    expect(purged.purgedAt).not.toBeNull();
    expect(purged.originalFilename).toBe(retention.PURGED_FILENAME);
    const kept = await prisma.verificationDocument.findUniqueOrThrow({ where: { id: shared.document.id } });
    expect(kept.purgedAt).toBeNull();
    expect(storageRemove).not.toHaveBeenCalledWith([shared.document.storagePath]);
  });

  it("aborts before anonymizing anything when Storage refuses the KYC deletion", async () => {
    const client = await user("Client stockage KO");
    await orgWithKyc(client.id);
    storageRemove.mockResolvedValue({ data: null, error: new Error("storage down") });

    await expect(gdpr.deleteOrAnonymizeProfile(client.id)).rejects.toThrow("storage down");
    expect((await prisma.profile.findUniqueOrThrow({ where: { id: client.id } })).deletedAt).toBeNull();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("erases support tickets before a hard delete (their FK is ON DELETE SET NULL)", async () => {
    const client = await user("Client sans historique");
    const ticket = await prisma.supportTicket.create({
      data: { userId: client.id, email: client.email, subject: "Question", message: "Mon adresse est …" },
    });

    const result = await gdpr.deleteOrAnonymizeProfile(client.id);
    expect(result.mode).toBe("hard_delete");
    const after = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(after.email).toBe("deleted@officeflex.invalid");
    expect(after.message).toBe(gdpr.ERASED_TEXT);
  });

  it("exports messages, tickets, disputes, dossiers (without file paths) and memberships", async () => {
    const client = await user("Client export");
    const past = new Date("2022-05-02T09:00:00Z");
    const b = await booking(client.id, { startsAt: past, endsAt: new Date(past.getTime() + 3600e3), status: "COMPLETED" });
    const conversation = await prisma.conversation.create({ data: { bookingId: b.id } });
    await prisma.message.create({ data: { conversationId: conversation.id, senderUserId: client.id, body: "Question" } });
    await prisma.message.create({ data: { conversationId: conversation.id, senderUserId: landlordId, body: "Réponse" } });
    await prisma.supportTicket.create({ data: { userId: client.id, email: client.email, subject: "S", message: "M" } });
    await prisma.dispute.create({ data: { bookingId: b.id, raisedByUserId: client.id, description: "Salle sale" } });
    const kyc = await orgWithKyc(client.id);

    const data = await gdpr.exportProfileData(client.id);
    expect(data.messages).toHaveLength(2);
    expect(data.messages.filter((m) => m.sentByYou)).toHaveLength(1);
    expect(JSON.stringify(data.messages)).not.toContain(landlordId);
    expect(data.supportTickets).toHaveLength(1);
    expect(data.disputes).toHaveLength(1);
    expect(data.verifications).toHaveLength(1);
    expect(data.verifications[0].documents[0]).toMatchObject({ originalFilename: "CNI_Jean_Dupont.pdf" });
    expect(JSON.stringify(data)).not.toContain(kyc.document.storagePath);
    expect(data.memberships).toHaveLength(1);
    expect(data.memberships[0].organization.id).toBe(kyc.org.id);
  });

  describe("purgeExpiredPersonalData (retention)", () => {
    it("clears old webhook payloads, deletes old search events and purges decided KYC files", async () => {
      const now = new Date();
      const old = new Date(now.getTime() - 100 * 24 * 3600 * 1000);
      const oldEvent = await prisma.webhookEvent.create({
        data: { provider: "stripe", providerEventId: `evt_old_${crypto.randomUUID()}`, type: "payment_intent.succeeded", payload: { customer: { email: "x@y.z" } }, processedAt: old },
      });
      const freshEvent = await prisma.webhookEvent.create({
        data: { provider: "stripe", providerEventId: `evt_new_${crypto.randomUUID()}`, type: "payment_intent.succeeded", payload: { id: "pi_1" } },
      });
      const oldSearch = await prisma.searchEvent.create({
        data: { city: "Paris", resultsCount: 3, createdAt: new Date(now.getTime() - 400 * 24 * 3600 * 1000) },
      });
      const freshSearch = await prisma.searchEvent.create({ data: { city: "Lyon", resultsCount: 1 } });

      const owner = await user("Bailleur rétention");
      const decidedLongAgo = await orgWithKyc(owner.id, { status: "APPROVED", reviewedAt: new Date(now.getTime() - 400 * 24 * 3600 * 1000) });
      const decidedRecently = await orgWithKyc(owner.id, { status: "REJECTED", reviewedAt: new Date(now.getTime() - 30 * 24 * 3600 * 1000) });
      const stillOpen = await orgWithKyc(owner.id, { status: "DRAFT", reviewedAt: null });

      const result = await retention.purgeExpiredPersonalData(now);
      expect(result.webhookPayloadsCleared).toBeGreaterThanOrEqual(1);
      expect(result.kycDocumentsPurged).toBeGreaterThanOrEqual(1);

      expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: oldEvent.id } })).payload).toEqual({});
      expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: freshEvent.id } })).payload).toEqual({ id: "pi_1" });
      expect(await prisma.searchEvent.findUnique({ where: { id: oldSearch.id } })).toBeNull();
      expect(await prisma.searchEvent.findUnique({ where: { id: freshSearch.id } })).not.toBeNull();

      const doc = (id: string) => prisma.verificationDocument.findUniqueOrThrow({ where: { id } });
      expect((await doc(decidedLongAgo.document.id)).purgedAt).not.toBeNull();
      expect((await doc(decidedRecently.document.id)).purgedAt).toBeNull();
      expect((await doc(stillOpen.document.id)).purgedAt).toBeNull();
      expect(storageRemove).toHaveBeenCalledWith(expect.arrayContaining([decidedLongAgo.document.storagePath]));

      await prisma.webhookEvent.deleteMany({ where: { id: { in: [oldEvent.id, freshEvent.id] } } });
      await prisma.searchEvent.deleteMany({ where: { id: freshSearch.id } });
    });

    it("never throws, even when every step fails", async () => {
      storageRemove.mockResolvedValue({ data: null, error: new Error("down") });
      const owner = await user("Bailleur KO");
      await orgWithKyc(owner.id, { status: "APPROVED", reviewedAt: new Date("2020-01-01T00:00:00Z") });
      const result = await retention.purgeExpiredPersonalData();
      expect(result.kycDocumentsPurged).toBeNull();
    });
  });
});
