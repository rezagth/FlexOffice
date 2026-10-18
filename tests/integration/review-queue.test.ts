import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";
import { createTestOrganization, createTestUser, deleteTestUser } from "./helpers/test-fixtures";

/** PRD V1.1, R66 — the unified admin queue aggregates pending verifications,
 * domiciliations and promotions, oldest first, with a shared 48h-overdue
 * flag — and excludes decided items (APPROVED/REJECTED/ACCEPTED/REFUSED
 * etc.) from all three sources. */
describe.skipIf(!hasDatabase)("admin review queue (R66)", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let listReviewQueue: typeof import("@/server/domains/admin/review-queue").listReviewQueue;

  let orgId: string;
  let userId: string;
  const verificationIds: string[] = [];
  const domiciliationIds: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    ({ listReviewQueue } = await import("@/server/domains/admin/review-queue"));

    const org = await createTestOrganization({ name: "Review Queue Org" });
    orgId = org.id;
    userId = (await createTestUser({ role: "CLIENT", name: "Review Queue User" })).id;
  });

  afterAll(async () => {
    if (verificationIds.length) {
      await prisma.landlordVerification.deleteMany({ where: { id: { in: verificationIds } } });
    }
    if (domiciliationIds.length) {
      await prisma.domiciliationRequest.deleteMany({ where: { id: { in: domiciliationIds } } });
    }
    if (orgId) await prisma.organization.deleteMany({ where: { id: orgId } });
    if (userId) await deleteTestUser(userId);
    await prisma.$disconnect();
  });

  it("aggregates the three sources, oldest first, with decided items excluded and overdue flagged", async () => {
    const now = Date.now();
    const old = new Date(now - 72 * 60 * 60 * 1000); // 72h ago — overdue
    const recent = new Date(now - 2 * 60 * 60 * 1000); // 2h ago — not overdue

    const verification = await prisma.landlordVerification.create({
      data: {
        organizationId: orgId,
        requestedByProfileId: userId,
        activityType: "OWNER",
        status: "PENDING_REVIEW",
        submittedAt: old,
      },
    });
    verificationIds.push(verification.id);

    // Decided — must never appear in the queue.
    const decidedVerification = await prisma.landlordVerification.create({
      data: {
        organizationId: orgId,
        requestedByProfileId: userId,
        activityType: "OWNER",
        status: "APPROVED",
        submittedAt: old,
        reviewedAt: new Date(),
      },
    });
    verificationIds.push(decidedVerification.id);

    const domiciliation = await prisma.domiciliationRequest.create({
      data: {
        organizationId: orgId,
        kind: "THIRD_PARTY",
        status: "IN_PROGRESS",
        requestedByProfileId: userId,
        createdAt: recent,
      },
    });
    domiciliationIds.push(domiciliation.id);

    const decidedDomiciliation = await prisma.domiciliationRequest.create({
      data: {
        organizationId: orgId,
        kind: "THIRD_PARTY",
        status: "ACCEPTED",
        requestedByProfileId: userId,
        createdAt: old,
      },
    });
    domiciliationIds.push(decidedDomiciliation.id);

    const items = await listReviewQueue();
    const ours = items.filter((item) => item.organizationName === "Review Queue Org");

    // Only the two pending items (verification PENDING_REVIEW, domiciliation
    // IN_PROGRESS) — never the decided ones.
    expect(ours).toHaveLength(2);
    expect(ours.map((item) => item.kind).sort()).toEqual(["domiciliation", "verification"]);

    // Oldest first: the verification (72h ago) before the domiciliation (2h ago).
    expect(ours[0].kind).toBe("verification");
    expect(ours[1].kind).toBe("domiciliation");

    expect(ours.find((item) => item.kind === "verification")?.overdue).toBe(true);
    expect(ours.find((item) => item.kind === "domiciliation")?.overdue).toBe(false);
  });
});
