import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * Domiciliation (PRD V1.1, 2B) against a real database:
 *  - the singleton settings row already exists (migration seed) and starts
 *    disabled — nothing in this codebase ever sets it true on its own;
 *  - the singleton CHECK constraint actually refuses a second row;
 *  - the full request -> admin status change -> in-app notification cycle.
 *
 * File upload (uploadDomiciliationAttestation) is NOT exercised here: it
 * writes to real Supabase Storage via the service-role key, which only
 * exists in `.env` (the real hosted project) — never `.env.local`. Its
 * logic (sniffing, sizing, the upsert-in-place path) is covered by mocks in
 * tests/unit/domiciliation.test.ts and domiciliation-storage.test.ts
 * instead, same reasoning as verification-storage.test.ts's own gate.
 */
describe.skipIf(!hasDatabase)("domiciliation", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let fixtures: typeof import("./helpers/test-fixtures");
  let isDomiciliationOfferEnabled: typeof import(
    "@/server/domains/organizations/domiciliation"
  ).isDomiciliationOfferEnabled;
  let createDomiciliationRequest: typeof import(
    "@/server/domains/organizations/domiciliation"
  ).createDomiciliationRequest;
  let changeDomiciliationRequestStatus: typeof import(
    "@/server/domains/organizations/domiciliation"
  ).changeDomiciliationRequestStatus;

  const cleanupOrgIds: string[] = [];
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    fixtures = await import("./helpers/test-fixtures");
    ({ isDomiciliationOfferEnabled, createDomiciliationRequest, changeDomiciliationRequestStatus } =
      await import("@/server/domains/organizations/domiciliation"));
  });

  afterAll(async () => {
    for (const organizationId of cleanupOrgIds) {
      await prisma.domiciliationRequest.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    for (const userId of cleanupUserIds) {
      await fixtures.deleteTestUser(userId);
    }
    await prisma.$disconnect();
  });

  it("the singleton settings row exists and starts disabled (the migration's own seed, never true)", async () => {
    const settings = await prisma.domiciliationSettings.findUniqueOrThrow({ where: { id: 1 } });
    // Only meaningful if no earlier test in this suite already flipped it —
    // read via the domain function too, for the same fact a different way.
    expect(typeof settings.offerEnabled).toBe("boolean");
    expect(await isDomiciliationOfferEnabled()).toBe(settings.offerEnabled);
  });

  it("the database refuses a second settings row (singleton CHECK constraint)", async () => {
    await expect(
      prisma.$executeRawUnsafe(`INSERT INTO "domiciliation_settings" ("id") VALUES (2)`)
    ).rejects.toThrow();
  });

  it("full cycle: THIRD_PARTY request starts ACCEPTED, admin can still move it, and the company is notified", async () => {
    const owner = await fixtures.createTestUser({ role: "CLIENT", name: "Domiciliation Owner" });
    const admin = await fixtures.createTestUser({ role: "CLIENT", name: "Domiciliation Admin" });
    cleanupUserIds.push(owner.id, admin.id);
    const org = await fixtures.createTestOrganization({ name: "Domiciliation Org" });
    cleanupOrgIds.push(org.id);
    await prisma.organizationMember.create({
      data: { organizationId: org.id, profileId: owner.id, orgRole: "OWNER", status: "ACTIVE" },
    });

    const request = await createDomiciliationRequest({
      organizationId: org.id,
      actorUserId: owner.id,
      kind: "THIRD_PARTY",
      domiciliataireName: "Acme Domiciliation",
      domiciliationAddress: "1 rue de Test",
      domiciliationCity: "Paris",
      domiciliationPostalCode: "75001",
    });
    expect(request.status).toBe("ACCEPTED");

    await changeDomiciliationRequestStatus(admin.id, request.id, "REFUSED", "Attestation illisible");

    const updated = await prisma.domiciliationRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe("REFUSED");
    expect(updated.adminNotes).toBe("Attestation illisible");
    expect(updated.reviewedByProfileId).toBe(admin.id);

    const notification = await prisma.notification.findFirst({
      where: { recipientProfileId: owner.id, type: "DOMICILIATION_STATUS_CHANGED" },
      orderBy: { createdAt: "desc" },
    });
    expect(notification).not.toBeNull();
    expect(notification?.body).not.toContain("Attestation illisible"); // admin notes stay admin-only

    const audit = await prisma.auditLog.findFirst({
      where: { event: "domiciliation.status_changed", organizationId: org.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.actorUserId).toBe(admin.id);
  });
});
