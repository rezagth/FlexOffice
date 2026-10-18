import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";
import {
  createTestOrganization,
  createTestProperty,
  createTestSpace,
  createTestUser,
  deleteTestUser,
} from "./helpers/test-fixtures";

/**
 * PRD V1.1, lot 3, commit 2 — promotions: tenant isolation, the full
 * draft -> pending -> published/refused lifecycle, server-only pricing with
 * price lock-in, the usage cap, and the admin moderation side (mandatory
 * reason, notification, audit, overlap prevention).
 *
 * Calls the domain functions directly (no next/headers, no running server),
 * same as tenant-isolation.test.ts and booking-creation.test.ts — the
 * route-level requireAdmin()/requirePromotionOrgAccess() checks are UI/HTTP
 * concerns, not what this suite is about.
 */
describe.skipIf(!hasDatabase)("promotions", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let partner: typeof import("@/server/domains/promotions/partner");
  let admin: typeof import("@/server/domains/promotions/admin");
  let errors: typeof import("@/server/lib/errors");
  let createBooking: typeof import("@/server/domains/bookings/create-booking").createBooking;

  let orgAId: string;
  let orgBId: string;
  let propertyAId: string;
  // Creates/edits/submits promotions as orgA — also the notification
  // recipient, same as the real flow (createdByProfileId).
  let partnerUserId: string;
  // Approves/refuses — a distinct actor, so "who did what" in the audit
  // trail is actually meaningful in this suite, not the same id twice.
  let adminUserId: string;
  let clientUserId: string;
  let spaceAId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    partner = await import("@/server/domains/promotions/partner");
    admin = await import("@/server/domains/promotions/admin");
    errors = await import("@/server/lib/errors");
    ({ createBooking } = await import("@/server/domains/bookings/create-booking"));

    const orgA = await createTestOrganization({ name: "Promo Org A" });
    const orgB = await createTestOrganization({ name: "Promo Org B" });
    orgAId = orgA.id;
    orgBId = orgB.id;

    partnerUserId = (await createTestUser({ role: "CLIENT", name: "Promo Partner" })).id;
    adminUserId = (await createTestUser({ role: "CLIENT", name: "Promo Admin" })).id;

    clientUserId = (await createTestUser({ role: "CLIENT", name: "Promo Client" })).id;
    await prisma.profile.update({
      where: { id: clientUserId },
      data: { accountNeed: "SEARCH", holderType: "INDIVIDUAL", phoneVerifiedAt: new Date() },
    });

    const propertyA = await createTestProperty(orgAId, partnerUserId);
    propertyAId = propertyA.id;
    const spaceA = await createTestSpace(orgAId, propertyAId, { status: "PUBLISHED" });
    spaceAId = spaceA.id;
    await prisma.spaceOpeningHours.create({
      data: { spaceId: spaceAId, weekday: 1, opensAt: "09:00", closesAt: "18:00" },
    });
  });

  afterAll(async () => {
    if (spaceAId) {
      await prisma.payment.deleteMany({ where: { booking: { spaceId: spaceAId } } });
      await prisma.booking.deleteMany({ where: { spaceId: spaceAId } });
      await prisma.spaceOpeningHours.deleteMany({ where: { spaceId: spaceAId } });
    }
    if (orgAId || orgBId) {
      await prisma.notification.deleteMany({ where: { recipientProfileId: { in: [partnerUserId, adminUserId, clientUserId] } } });
      await prisma.promotionSpace.deleteMany({ where: { promotion: { organizationId: { in: [orgAId, orgBId] } } } });
      await prisma.promotion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
      await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    }
    if (spaceAId) await prisma.space.deleteMany({ where: { id: spaceAId } });
    if (propertyAId) await prisma.property.deleteMany({ where: { id: propertyAId } });
    if (orgAId) await prisma.organization.deleteMany({ where: { id: orgAId } });
    if (orgBId) await prisma.organization.deleteMany({ where: { id: orgBId } });
    if (partnerUserId) await deleteTestUser(partnerUserId);
    if (adminUserId) await deleteTestUser(adminUserId);
    if (clientUserId) await deleteTestUser(clientUserId);
    await prisma.$disconnect();
  });

  describe("tenant isolation", () => {
    it("org B cannot read or edit org A's promotion", async () => {
      const promotion = await partner.createPromotion(orgAId, partnerUserId, {
        discountType: "PERCENTAGE",
        discountPercent: 10,
        startsAt: new Date("2031-01-01"),
        endsAt: null,
        usageLimit: null,
        spaceIds: [spaceAId],
      });

      await expect(partner.getPromotionForOrganization(orgBId, promotion.id)).rejects.toBeInstanceOf(
        errors.NotFoundError
      );
      await expect(
        partner.updatePromotion(orgBId, partnerUserId, promotion.id, {
          discountType: "PERCENTAGE",
          discountPercent: 50,
          startsAt: new Date("2031-01-01"),
          endsAt: null,
          usageLimit: null,
          spaceIds: [spaceAId],
        })
      ).rejects.toBeInstanceOf(errors.NotFoundError);

      const own = await partner.getPromotionForOrganization(orgAId, promotion.id);
      expect(own.id).toBe(promotion.id);

      await prisma.promotionSpace.deleteMany({ where: { promotionId: promotion.id } });
      await prisma.promotion.delete({ where: { id: promotion.id } });
    });

    it("refuses attaching another organization's space to a promotion", async () => {
      // spaceAId belongs to orgA — creating "as" orgB must be refused (404,
      // not 403: an id known is not an id owned) rather than silently
      // accepted.
      await expect(
        partner.createPromotion(orgBId, partnerUserId, {
          discountType: "PERCENTAGE",
          discountPercent: 10,
          startsAt: new Date("2031-01-01"),
          endsAt: null,
          usageLimit: null,
          spaceIds: [spaceAId],
        })
      ).rejects.toBeInstanceOf(errors.NotFoundError);
    });
  });

  describe("lifecycle, moderation and notifications", () => {
    it("draft -> submit -> approve, with a mandatory-reason refusal and overlap prevention along the way", async () => {
      const promo1 = await partner.createPromotion(orgAId, partnerUserId, {
        discountType: "PERCENTAGE",
        discountPercent: 20,
        startsAt: new Date("2031-02-01"),
        endsAt: new Date("2031-02-28"),
        usageLimit: null,
        spaceIds: [spaceAId],
      });
      expect(promo1.status).toBe("DRAFT");

      await partner.submitPromotion(orgAId, partnerUserId, promo1.id);
      const pendingList = await admin.listPendingPromotionsForAdmin();
      expect(pendingList.some((p) => p.id === promo1.id)).toBe(true);

      await admin.approvePromotion(adminUserId, promo1.id);
      const approved = await prisma.promotion.findUniqueOrThrow({ where: { id: promo1.id } });
      expect(approved.status).toBe("PUBLISHED");
      expect(approved.reviewedByProfileId).toBe(adminUserId);

      const auditApprove = await prisma.auditLog.findFirst({
        where: { event: "promotion.approved", metadata: { path: ["promotionId"], equals: promo1.id } },
      });
      expect(auditApprove).not.toBeNull();
      const notifyApprove = await prisma.notification.findFirst({
        where: { recipientProfileId: partnerUserId, type: "PROMOTION_STATUS_CHANGED", title: { contains: "approuvée" } },
      });
      expect(notifyApprove).not.toBeNull();

      // A second promotion overlapping the first, on the same space, cannot
      // be approved — "the" discounted price must always have one answer.
      const promo2 = await partner.createPromotion(orgAId, partnerUserId, {
        discountType: "FIXED_AMOUNT",
        discountAmountCents: 1000,
        startsAt: new Date("2031-02-15"),
        endsAt: null,
        usageLimit: null,
        spaceIds: [spaceAId],
      });
      await partner.submitPromotion(orgAId, partnerUserId, promo2.id);
      await expect(admin.approvePromotion(adminUserId, promo2.id)).rejects.toBeInstanceOf(errors.ValidationError);

      // Refusing requires a reason, and "OTHER" requires a free-text note —
      // enforced by rejectPromotionSchema and the DB CHECK alike.
      await admin.rejectPromotion(adminUserId, promo2.id, "INCONSISTENT_PRICE", undefined);
      const rejected = await prisma.promotion.findUniqueOrThrow({ where: { id: promo2.id } });
      expect(rejected.status).toBe("REJECTED");
      expect(rejected.rejectionReason).toBe("INCONSISTENT_PRICE");
      const auditReject = await prisma.auditLog.findFirst({
        where: { event: "promotion.rejected", metadata: { path: ["promotionId"], equals: promo2.id } },
      });
      expect(auditReject).not.toBeNull();
      const notifyReject = await prisma.notification.findFirst({
        where: { recipientProfileId: partnerUserId, type: "PROMOTION_STATUS_CHANGED", title: { contains: "refusée" } },
      });
      expect(notifyReject).not.toBeNull();

      // Editing a PUBLISHED promotion reverts it to PENDING for re-review.
      await partner.updatePromotion(orgAId, partnerUserId, promo1.id, {
        discountType: "PERCENTAGE",
        discountPercent: 25,
        startsAt: new Date("2031-02-01"),
        endsAt: new Date("2031-02-28"),
        usageLimit: null,
        spaceIds: [spaceAId],
      });
      const afterEdit = await prisma.promotion.findUniqueOrThrow({ where: { id: promo1.id } });
      expect(afterEdit.status).toBe("PENDING");
      expect(afterEdit.discountPercent).toBe(25);

      // Clean up this describe block's rows so the pricing tests below start
      // from a known state.
      await admin.approvePromotion(adminUserId, promo1.id);
      await prisma.promotionSpace.deleteMany({ where: { promotionId: { in: [promo1.id, promo2.id] } } });
      await prisma.promotion.deleteMany({ where: { id: { in: [promo1.id, promo2.id] } } });
    });
  });

  describe("server-only pricing, price lock-in and the usage cap", () => {
    it("a booking on a published promotion's dates gets the discounted price, locked in", async () => {
      const promotion = await partner.createPromotion(orgAId, partnerUserId, {
        discountType: "PERCENTAGE",
        discountPercent: 20,
        startsAt: new Date("2031-03-01"),
        endsAt: new Date("2031-03-31"),
        usageLimit: 1,
        spaceIds: [spaceAId],
      });
      await partner.submitPromotion(orgAId, partnerUserId, promotion.id);
      await admin.approvePromotion(adminUserId, promotion.id);

      const { booking } = await createBooking(clientUserId, {
        spaceId: spaceAId,
        date: "2031-03-03", // a Monday within the promotion's window
        slot: "MORNING",
        participantsCount: 2,
        purpose: "Réservation promotionnelle",
        acceptTerms: true,
      });

      expect(booking.originalPriceAmountCents).toBe(12000); // createTestSpace's halfDayPriceCents
      expect(booking.discountAmountCents).toBe(2400); // 20% of 12000
      expect(booking.priceAmountCents).toBe(9600);
      expect(booking.promotionId).toBe(promotion.id);
      // Commission computed on the POST-discount price, never the original.
      expect(booking.commissionAmountCents).toBe(Math.round(9600 * 0.15));

      const afterOneUse = await prisma.promotion.findUniqueOrThrow({ where: { id: promotion.id } });
      expect(afterOneUse.usageCount).toBe(1);

      // Usage cap (1) reached: resolve.ts finds no eligible promotion for
      // this space any more (findActivePromotionForSpace filters out an
      // exhausted one) — the next booking still succeeds, simply at full
      // price, rather than silently reusing the exhausted promotion.
      const { booking: secondBooking } = await createBooking(clientUserId, {
        spaceId: spaceAId,
        date: "2031-03-10", // another Monday within the window, free slot
        slot: "MORNING",
        participantsCount: 2,
        purpose: "Plafond atteint",
        acceptTerms: true,
      });
      expect(secondBooking.discountAmountCents).toBe(0);
      expect(secondBooking.promotionId).toBeNull();
      expect(secondBooking.priceAmountCents).toBe(12000);

      // Price lock-in: refusing or expiring the promotion afterward must
      // never change what the client already paid.
      await prisma.promotion.update({ where: { id: promotion.id }, data: { status: "EXPIRED" } });
      const lockedIn = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(lockedIn.priceAmountCents).toBe(9600);
      expect(lockedIn.discountAmountCents).toBe(2400);

      await prisma.promotionSpace.deleteMany({ where: { promotionId: promotion.id } });
      await prisma.promotion.delete({ where: { id: promotion.id } });
    });
  });
});
