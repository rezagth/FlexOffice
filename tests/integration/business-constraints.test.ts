import { beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";
import {
  createTestOrganization,
  createTestProperty,
  createTestSpace,
  createTestUser,
  uniqueSiret,
  uniqueSuffix,
} from "./helpers/test-fixtures";

/**
 * Business integrity constraints (migration 20260903102000).
 *
 * The schema had primary keys, foreign keys, unique indexes and one EXCLUDE
 * constraint — and no CHECK at all. Nothing stopped a space with capacity 0,
 * a negative price, a booking ending before it starts, or a payment whose
 * parts did not add up. Each test below writes the invalid row directly
 * through Prisma, bypassing every service-layer check, so what is being
 * asserted is that the DATABASE refuses it.
 *
 * Also covered: the two rules that could not be constraints and live in the
 * service layer instead, and the composite foreign keys that keep the
 * denormalised organizationId columns honest.
 */
describe.skipIf(!hasDatabase)("business integrity constraints", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let orgId: string;
  let propertyId: string;
  let spaceId: string;
  let clientUserId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    const user = await createTestUser();
    clientUserId = user.id;
    const org = await createTestOrganization();
    orgId = org.id;
    const property = await createTestProperty(orgId, clientUserId);
    propertyId = property.id;
    const space = await createTestSpace(orgId, propertyId, { capacity: 8 });
    spaceId = space.id;
  });

  function validBooking(overrides: Record<string, unknown> = {}) {
    return {
      spaceId,
      organizationId: orgId,
      clientUserId,
      startsAt: new Date("2027-03-01T09:00:00Z"),
      endsAt: new Date("2027-03-01T12:00:00Z"),
      participantsCount: 4,
      purpose: "Constraint fixture",
      priceAmountCents: 12000,
      commissionAmountCents: 1800,
      ...overrides,
    };
  }

  describe("spaces", () => {
    it("rejects a non-positive capacity", async () => {
      await expect(createTestSpace(orgId, propertyId, { capacity: 0 })).rejects.toThrow(
        /spaces_capacity_positive_check/
      );
    });

    it("rejects a negative price", async () => {
      await expect(
        prisma.space.create({
          data: {
            propertyId,
            organizationId: orgId,
            slug: `neg-price-${uniqueSuffix()}`,
            name: "Negative price",
            type: "MEETING_ROOM",
            description: "x",
            address: "1 rue de Test",
            city: "Paris",
            postalCode: "75001",
            capacity: 4,
            amenities: [],
            photos: [],
            halfDayPriceCents: -1,
            dayPriceCents: 20000,
          },
        })
      ).rejects.toThrow(/half_day_price_non_negative/);
    });
  });

  describe("bookings", () => {
    it("rejects a slot that ends before it starts", async () => {
      await expect(
        prisma.booking.create({
          data: validBooking({
            startsAt: new Date("2027-03-02T12:00:00Z"),
            endsAt: new Date("2027-03-02T09:00:00Z"),
          }),
        })
      ).rejects.toThrow(/bookings_ends_after_starts_check/);
    });

    it("rejects a zero-length slot — an empty range never overlaps anything", async () => {
      // Without this, a degenerate booking would slip past the EXCLUDE
      // constraint entirely, since an empty range conflicts with nothing.
      const instant = new Date("2027-03-03T09:00:00Z");
      await expect(
        prisma.booking.create({
          data: validBooking({ startsAt: instant, endsAt: instant }),
        })
      ).rejects.toThrow(/bookings_ends_after_starts_check/);
    });

    it("rejects a non-positive participant count", async () => {
      await expect(
        prisma.booking.create({
          data: validBooking({
            participantsCount: 0,
            startsAt: new Date("2027-03-04T09:00:00Z"),
            endsAt: new Date("2027-03-04T12:00:00Z"),
          }),
        })
      ).rejects.toThrow(/bookings_participants_positive_check/);
    });

    it("rejects a negative amount", async () => {
      // No single row can violate `price_non_negative` alone: that rule is
      // entailed by `commission_non_negative` AND `commission_within_price`
      // (0 <= commission <= price implies price >= 0). It is kept as an
      // explicit constraint anyway, so removing either of the other two does
      // not quietly allow negative prices. PostgreSQL reports whichever check
      // it evaluates first, so the assertion accepts any of the three — it
      // still fails if the amounts stop being constrained at all.
      await expect(
        prisma.booking.create({
          data: validBooking({
            priceAmountCents: -100,
            startsAt: new Date("2027-03-05T09:00:00Z"),
            endsAt: new Date("2027-03-05T12:00:00Z"),
          }),
        })
      ).rejects.toThrow(
        /bookings_(price_non_negative|commission_non_negative|commission_within_price)_check/
      );
    });

    it("rejects a negative commission", async () => {
      await expect(
        prisma.booking.create({
          data: validBooking({
            commissionAmountCents: -1,
            startsAt: new Date("2027-03-05T14:00:00Z"),
            endsAt: new Date("2027-03-05T17:00:00Z"),
          }),
        })
      ).rejects.toThrow(/bookings_commission_non_negative_check/);
    });

    it("rejects a commission larger than the amount charged", async () => {
      await expect(
        prisma.booking.create({
          data: validBooking({
            priceAmountCents: 10000,
            commissionAmountCents: 10001,
            startsAt: new Date("2027-03-06T09:00:00Z"),
            endsAt: new Date("2027-03-06T12:00:00Z"),
          }),
        })
      ).rejects.toThrow(/bookings_commission_within_price_check/);
    });

    it("accepts a well-formed booking, so the constraints are not simply blocking everything", async () => {
      const booking = await prisma.booking.create({
        data: validBooking({
          startsAt: new Date("2027-04-01T09:00:00Z"),
          endsAt: new Date("2027-04-01T12:00:00Z"),
        }),
      });
      expect(booking.id).toBeTruthy();
      await prisma.booking.delete({ where: { id: booking.id } });
    });
  });

  describe("tenant coherence (composite foreign keys)", () => {
    it("refuses a booking whose organizationId does not match its space's", async () => {
      // The leak this prevents: partner revenue and admin figures aggregate
      // on booking.organization_id, and the partner dashboard scopes its
      // queries by it. A mismatched row is both a wrong number and a
      // cross-tenant read.
      const otherOrg = await createTestOrganization({ name: "Other Org" });

      await expect(
        prisma.booking.create({
          data: validBooking({
            organizationId: otherOrg.id,
            startsAt: new Date("2027-03-07T09:00:00Z"),
            endsAt: new Date("2027-03-07T12:00:00Z"),
          }),
        })
      ).rejects.toThrow(/bookings_space_id_organization_id_fkey/);
    });

    it("keeps the composite foreign keys in place", async () => {
      // Prisma cannot express a composite FK alongside the single-column
      // relations, so these constraints are hand-written and invisible to the
      // schema diff. If a future `prisma migrate dev` drops them, this fails.
      const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
        SELECT conname FROM pg_constraint
        WHERE conname IN (
          'bookings_space_id_organization_id_fkey',
          'payments_booking_id_organization_id_fkey'
        )
      `;
      expect(constraints.map((c) => c.conname).sort()).toEqual([
        "bookings_space_id_organization_id_fkey",
        "payments_booking_id_organization_id_fkey",
      ]);
    });
  });

  describe("payments", () => {
    it("rejects a split that does not add up to the total", async () => {
      const booking = await prisma.booking.create({
        data: validBooking({
          startsAt: new Date("2027-05-01T09:00:00Z"),
          endsAt: new Date("2027-05-01T12:00:00Z"),
        }),
      });

      await expect(
        prisma.payment.create({
          data: {
            bookingId: booking.id,
            organizationId: orgId,
            providerPaymentIntentId: `pi_${uniqueSuffix()}`,
            amountCents: 12000,
            commissionAmountCents: 1800,
            netAmountCents: 9000, // 1800 + 9000 != 12000
          },
        })
      ).rejects.toThrow(/payments_amount_splits_exactly_check/);

      await prisma.booking.delete({ where: { id: booking.id } });
    });

    it("accepts an exact split", async () => {
      const booking = await prisma.booking.create({
        data: validBooking({
          startsAt: new Date("2027-05-02T09:00:00Z"),
          endsAt: new Date("2027-05-02T12:00:00Z"),
        }),
      });

      const payment = await prisma.payment.create({
        data: {
          bookingId: booking.id,
          organizationId: orgId,
          providerPaymentIntentId: `pi_${uniqueSuffix()}`,
          amountCents: 12000,
          commissionAmountCents: 1800,
          netAmountCents: 10200,
        },
      });
      expect(payment.id).toBeTruthy();

      await prisma.payment.delete({ where: { id: payment.id } });
      await prisma.booking.delete({ where: { id: booking.id } });
    });

    it("rejects a zero-amount refund", async () => {
      const booking = await prisma.booking.create({
        data: validBooking({
          startsAt: new Date("2027-05-03T09:00:00Z"),
          endsAt: new Date("2027-05-03T12:00:00Z"),
        }),
      });
      const payment = await prisma.payment.create({
        data: {
          bookingId: booking.id,
          organizationId: orgId,
          providerPaymentIntentId: `pi_${uniqueSuffix()}`,
          amountCents: 12000,
          commissionAmountCents: 1800,
          netAmountCents: 10200,
        },
      });

      await expect(
        prisma.refund.create({
          data: {
            paymentId: payment.id,
            amountCents: 0,
            reason: "nothing",
            providerRefundId: `re_${uniqueSuffix()}`,
          },
        })
      ).rejects.toThrow(/refunds_amount_positive_check/);

      await prisma.payment.delete({ where: { id: payment.id } });
      await prisma.booking.delete({ where: { id: booking.id } });
    });
  });

  describe("organizations", () => {
    it("rejects a malformed SIRET written through Prisma, which bypasses the signup trigger", async () => {
      await expect(
        prisma.organization.create({
          data: {
            name: "Bad SIRET",
            siret: "not-a-siret",
            email: "x@test.local",
            address: "1 rue de Test",
            city: "Paris",
            postalCode: "75001",
          },
        })
      ).rejects.toThrow(/organizations_siret_format_check/);
    });

    it("accepts a 14-digit SIRET", async () => {
      const org = await prisma.organization.create({
        data: {
          name: "Good SIRET",
          siret: uniqueSiret(),
          email: "y@test.local",
          address: "1 rue de Test",
          city: "Paris",
          postalCode: "75001",
        },
      });
      expect(org.id).toBeTruthy();
    });
  });

  describe("opening hours", () => {
    it("rejects a weekday outside 0..6", async () => {
      await expect(
        prisma.spaceOpeningHours.create({
          data: { spaceId, weekday: 7, opensAt: "09:00", closesAt: "18:00" },
        })
      ).rejects.toThrow(/space_opening_hours_weekday_range_check/);
    });

    it("rejects a malformed time", async () => {
      // "0900" rather than "9h": it is lexicographically below "18:00", so it
      // satisfies `closes_after_opens` and the format check is the only rule
      // it breaks. ("9h" > "18:00" as strings, which would trip the ordering
      // check first and prove nothing about the format.)
      await expect(
        prisma.spaceOpeningHours.create({
          data: { spaceId, weekday: 1, opensAt: "0900", closesAt: "18:00" },
        })
      ).rejects.toThrow(/opens_at_format_check/);
    });

    it("rejects an out-of-range hour that still looks like a time", async () => {
      await expect(
        prisma.spaceOpeningHours.create({
          data: { spaceId, weekday: 3, opensAt: "09:00", closesAt: "25:00" },
        })
      ).rejects.toThrow(/closes_at_format_check/);
    });

    it("rejects a closing time at or before the opening time", async () => {
      await expect(
        prisma.spaceOpeningHours.create({
          data: { spaceId, weekday: 2, opensAt: "18:00", closesAt: "09:00" },
        })
      ).rejects.toThrow(/closes_after_opens_check/);
    });
  });

  describe("rules the database cannot express", () => {
    it("enforces participants <= capacity in the service layer", async () => {
      // Cross-table, so no CHECK can hold it. The trade-off is documented in
      // migration 20260903102000; this is the other half of it.
      const { assertParticipantsFitCapacity } = await import(
        "@/server/domains/bookings/booking-invariants"
      );
      const space = await prisma.space.findUniqueOrThrow({ where: { id: spaceId } });

      expect(() => assertParticipantsFitCapacity(space.capacity + 1, space.capacity)).toThrow();
      expect(() => assertParticipantsFitCapacity(space.capacity, space.capacity)).not.toThrow();

      // And the database genuinely does NOT stop it — which is precisely why
      // the service check has to exist and be called.
      const overCapacity = await prisma.booking.create({
        data: validBooking({
          participantsCount: space.capacity + 50,
          startsAt: new Date("2027-06-01T09:00:00Z"),
          endsAt: new Date("2027-06-01T12:00:00Z"),
        }),
      });
      expect(overCapacity.participantsCount).toBe(space.capacity + 50);
      await prisma.booking.delete({ where: { id: overCapacity.id } });
    });

    it("enforces the refund total against the payment in the service layer", async () => {
      const { assertRefundFitsPayment } = await import(
        "@/server/domains/payments/refund-invariants"
      );

      const booking = await prisma.booking.create({
        data: validBooking({
          startsAt: new Date("2027-06-02T09:00:00Z"),
          endsAt: new Date("2027-06-02T12:00:00Z"),
        }),
      });
      const payment = await prisma.payment.create({
        data: {
          bookingId: booking.id,
          organizationId: orgId,
          providerPaymentIntentId: `pi_${uniqueSuffix()}`,
          amountCents: 10000,
          commissionAmountCents: 1500,
          netAmountCents: 8500,
        },
      });

      await expect(
        assertRefundFitsPayment({ paymentId: payment.id, amountCents: 10000 })
      ).resolves.toBeUndefined();

      await expect(
        assertRefundFitsPayment({ paymentId: payment.id, amountCents: 10001 })
      ).rejects.toThrow(/dépasse le montant payé/);

      // A refund already in flight counts towards the total: ignoring PENDING
      // is how the same amount gets refunded twice.
      await prisma.refund.create({
        data: {
          paymentId: payment.id,
          amountCents: 6000,
          reason: "partial",
          providerRefundId: `re_${uniqueSuffix()}`,
          status: "PENDING",
        },
      });

      await expect(
        assertRefundFitsPayment({ paymentId: payment.id, amountCents: 5000 })
      ).rejects.toThrow(/dépasse le montant payé/);
      await expect(
        assertRefundFitsPayment({ paymentId: payment.id, amountCents: 4000 })
      ).resolves.toBeUndefined();

      await prisma.refund.deleteMany({ where: { paymentId: payment.id } });
      await prisma.payment.delete({ where: { id: payment.id } });
      await prisma.booking.delete({ where: { id: booking.id } });
    });
  });
});
