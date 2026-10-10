import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * Reviews against a real database: who may write one and when, one per
 * booking, the landlord's single reply scoped to its organization, admin
 * hiding, the public averages, the invitation e-mail and GDPR erasure.
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

describe.skipIf(!hasDatabase)("reviews", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let fixtures: typeof import("./helpers/test-fixtures");
  let errors: typeof import("@/server/lib/errors");
  let reviews: typeof import("@/server/domains/reviews/reviews");

  let clientId: string;
  let otherClientId: string;
  let adminId: string;
  let orgId: string;
  let otherOrgId: string;
  let spaceId: string;
  let propertyId: string;

  const DAY = 86_400_000;
  const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

  async function booking(opts: {
    status: "CONFIRMED" | "COMPLETED" | "PENDING" | "CANCELLED";
    endedDaysAgo: number;
    client?: string;
  }) {
    const endsAt = daysAgo(opts.endedDaysAgo);
    return prisma.booking.create({
      data: {
        spaceId,
        organizationId: orgId,
        clientUserId: opts.client ?? clientId,
        startsAt: new Date(endsAt.getTime() - 4 * 3_600_000),
        endsAt,
        status: opts.status,
        participantsCount: 2,
        purpose: "Test",
        priceAmountCents: 10000,
        commissionAmountCents: 1500,
      },
    });
  }

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
    delete process.env.OFFICEFLEX_DEMO_MODE;

    ({ prisma } = await import("@/server/db/prisma"));
    fixtures = await import("./helpers/test-fixtures");
    errors = await import("@/server/lib/errors");
    reviews = await import("@/server/domains/reviews/reviews");

    const [client, otherClient, landlord, admin] = await Promise.all([
      fixtures.createTestUser({ role: "CLIENT", name: "Camille Durand" }),
      fixtures.createTestUser({ role: "CLIENT", name: "Autre Client" }),
      fixtures.createTestUser({ role: "CLIENT", name: "Review Landlord" }),
      fixtures.createTestUser({ role: "CLIENT", name: "Review Admin" }),
    ]);
    clientId = client.id;
    otherClientId = otherClient.id;
    adminId = admin.id;

    const org = await fixtures.createTestOrganization({ name: "Review Org" });
    orgId = org.id;
    otherOrgId = (await fixtures.createTestOrganization({ name: "Other Org" })).id;
    await prisma.organizationMember.create({ data: { organizationId: orgId, profileId: landlord.id, orgRole: "OWNER" } });
    propertyId = (await fixtures.createTestProperty(orgId, landlord.id)).id;
    spaceId = (await fixtures.createTestSpace(orgId, propertyId, { status: "PUBLISHED" })).id;
  });

  beforeEach(() => {
    sent.length = 0;
  });

  describe("writing a review", () => {
    it("the client of a completed booking can review it once; the landlord is e-mailed", async () => {
      const b = await booking({ status: "COMPLETED", endedDaysAgo: 2 });
      const review = await reviews.createReview(clientId, b.id, { rating: 4, comment: "Très bien" });
      expect(review.rating).toBe(4);

      const stored = await prisma.spaceReview.findUniqueOrThrow({ where: { id: review.id } });
      expect(stored).toMatchObject({ spaceId, organizationId: orgId, authorProfileId: clientId, comment: "Très bien" });
      expect(sent.some((m) => m.subject.includes("Nouvel avis"))).toBe(true);

      await expect(reviews.createReview(clientId, b.id, { rating: 5, comment: null })).rejects.toBeInstanceOf(
        errors.ConflictError
      );
      const audit = await prisma.auditLog.findFirst({ where: { event: "review.created", organizationId: orgId } });
      expect(audit).not.toBeNull();
    });

    it("a confirmed booking whose slot has ended is reviewable before the job marks it completed", async () => {
      const b = await booking({ status: "CONFIRMED", endedDaysAgo: 0.1 });
      await expect(reviews.createReview(clientId, b.id, { rating: 5, comment: null })).resolves.toBeDefined();
    });

    it("refuses a booking that has not ended, was cancelled, or ended too long ago", async () => {
      const future = await prisma.booking.create({
        data: {
          spaceId,
          organizationId: orgId,
          clientUserId: clientId,
          startsAt: new Date(Date.now() + DAY),
          endsAt: new Date(Date.now() + DAY + 3_600_000),
          status: "CONFIRMED",
          participantsCount: 1,
          purpose: "Test",
          priceAmountCents: 10000,
          commissionAmountCents: 1500,
        },
      });
      const cancelled = await booking({ status: "CANCELLED", endedDaysAgo: 3 });
      const old = await booking({ status: "COMPLETED", endedDaysAgo: reviews.REVIEW_WINDOW_DAYS + 1 });
      for (const b of [future, cancelled, old]) {
        await expect(reviews.createReview(clientId, b.id, { rating: 3, comment: null })).rejects.toBeInstanceOf(
          errors.ConflictError
        );
      }
    });

    it("another account's booking is a 404, not a 403", async () => {
      const b = await booking({ status: "COMPLETED", endedDaysAgo: 1 });
      await expect(reviews.createReview(otherClientId, b.id, { rating: 1, comment: null })).rejects.toBeInstanceOf(
        errors.NotFoundError
      );
    });

    it("the database refuses a rating outside 1-5", async () => {
      const b = await booking({ status: "COMPLETED", endedDaysAgo: 1 });
      await expect(
        prisma.spaceReview.create({
          data: { bookingId: b.id, spaceId, organizationId: orgId, authorProfileId: clientId, rating: 6 },
        })
      ).rejects.toThrow();
    });

    it("the database refuses a review whose organization is not the booking's", async () => {
      const b = await booking({ status: "COMPLETED", endedDaysAgo: 1 });
      await expect(
        prisma.spaceReview.create({
          data: { bookingId: b.id, spaceId, organizationId: otherOrgId, authorProfileId: clientId, rating: 3 },
        })
      ).rejects.toThrow();
    });
  });

  describe("landlord reply", () => {
    it("one reply, scoped to the booking's organization", async () => {
      const b = await booking({ status: "COMPLETED", endedDaysAgo: 1 });
      const review = await reviews.createReview(clientId, b.id, { rating: 2, comment: "Bruyant" });

      await expect(
        reviews.replyToReview({ organizationId: otherOrgId, actorUserId: adminId, reviewId: review.id, reply: "x" })
      ).rejects.toBeInstanceOf(errors.NotFoundError);

      await reviews.replyToReview({ organizationId: orgId, actorUserId: adminId, reviewId: review.id, reply: "Merci, c'est noté." });
      const stored = await prisma.spaceReview.findUniqueOrThrow({ where: { id: review.id } });
      expect(stored.landlordReply).toBe("Merci, c'est noté.");
      expect(stored.landlordRepliedAt).not.toBeNull();

      await expect(
        reviews.replyToReview({ organizationId: orgId, actorUserId: adminId, reviewId: review.id, reply: "Encore" })
      ).rejects.toBeInstanceOf(errors.ConflictError);
    });
  });

  describe("public reads and moderation", () => {
    it("hidden reviews leave the list and the average, and come back when shown again", async () => {
      const space = await fixtures.createTestSpace(orgId, propertyId, { status: "PUBLISHED" });
      const mk = async (rating: number) => {
        const b = await prisma.booking.create({
          data: {
            spaceId: space.id,
            organizationId: orgId,
            clientUserId: clientId,
            startsAt: daysAgo(2),
            endsAt: daysAgo(1.9),
            status: "COMPLETED",
            participantsCount: 1,
            purpose: "Test",
            priceAmountCents: 10000,
            commissionAmountCents: 1500,
          },
        });
        return reviews.createReview(clientId, b.id, { rating, comment: null });
      };
      await mk(5);
      const low = await mk(2);

      let summary = (await reviews.getReviewSummaries([space.id])).get(space.id);
      expect(summary).toEqual({ average: 3.5, count: 2 });

      await reviews.setReviewHidden({ adminUserId: adminId, reviewId: low.id, hidden: true, reason: "Hors sujet" });
      summary = (await reviews.getReviewSummaries([space.id])).get(space.id);
      expect(summary).toEqual({ average: 5, count: 1 });
      expect((await reviews.listSpaceReviews(space.id)).map((r) => r.id)).not.toContain(low.id);
      await expect(
        reviews.setReviewHidden({ adminUserId: adminId, reviewId: low.id, hidden: true, reason: "Encore" })
      ).rejects.toBeInstanceOf(errors.ConflictError);

      await reviews.setReviewHidden({ adminUserId: adminId, reviewId: low.id, hidden: false });
      expect((await reviews.getReviewSummaries([space.id])).get(space.id)?.count).toBe(2);
    });

    it("the public author label is a first name and an initial", async () => {
      const list = await reviews.listSpaceReviews(spaceId);
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((r) => r.authorLabel === "Camille D.")).toBe(true);
    });
  });

  describe("invitations", () => {
    it("invites recently completed bookings once, never old ones or reviewed ones", async () => {
      const recent = await booking({ status: "COMPLETED", endedDaysAgo: 1, client: otherClientId });
      const old = await booking({ status: "COMPLETED", endedDaysAgo: 20, client: otherClientId });

      await reviews.sendReviewInvitations();
      const after = await prisma.booking.findMany({ where: { id: { in: [recent.id, old.id] } } });
      expect(after.find((b) => b.id === recent.id)?.reviewInvitedAt).not.toBeNull();
      expect(after.find((b) => b.id === old.id)?.reviewInvitedAt).toBeNull();
      const invitations = sent.filter((m) => m.subject.startsWith("Comment s'est passée"));
      expect(invitations.length).toBeGreaterThanOrEqual(1);

      sent.length = 0;
      await reviews.sendReviewInvitations();
      expect(sent.filter((m) => m.subject.startsWith("Comment s'est passée")).some((m) => m.text.includes(recent.id))).toBe(false);
      const second = await prisma.booking.findUniqueOrThrow({ where: { id: recent.id } });
      expect(second.reviewInvitedAt).toEqual(after.find((b) => b.id === recent.id)?.reviewInvitedAt);
    });
  });

  describe("eligibility helper", () => {
    it("matches the rules", () => {
      const now = new Date();
      expect(reviews.reviewEligibility({ status: "COMPLETED", endsAt: daysAgo(1) }, now)).toBe("ELIGIBLE");
      expect(reviews.reviewEligibility({ status: "CONFIRMED", endsAt: new Date(now.getTime() + DAY) }, now)).toBe(
        "NOT_FINISHED"
      );
      expect(reviews.reviewEligibility({ status: "PENDING", endsAt: daysAgo(1) }, now)).toBe("NOT_REVIEWABLE");
      expect(reviews.reviewEligibility({ status: "COMPLETED", endsAt: daysAgo(31) }, now)).toBe("WINDOW_CLOSED");
    });
  });
});
