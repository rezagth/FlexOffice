import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * Security regression tests for the booking funnel, calling the domain
 * function directly (no next/headers, so no running server needed).
 *
 * Covers two guardrails that must never regress:
 *  - the price is always recomputed server-side from the space, so a
 *    price sent by the caller is worthless;
 *  - a slot conflict surfaces as a 409-mapped ConflictError, never a 500,
 *    and the guarantee is the database EXCLUDE constraint rather than the
 *    application's own availability check.
 */
describe.skipIf(!hasDatabase)("createBooking — pricing and slot conflicts", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let createBooking: typeof import("@/server/domains/bookings/create-booking").createBooking;
  let ConflictError: typeof import("@/server/lib/errors").ConflictError;
  let orgId: string;
  let propertyId: string;
  let spaceId: string;
  let clientUserId: string;
  const date = "2031-06-02"; // a Monday

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    ({ createBooking } = await import("@/server/domains/bookings/create-booking"));
    ({ ConflictError } = await import("@/server/lib/errors"));

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Created before the org/property below: Property.createdByProfileId
    // needs a real profile to point at, and this is the profile already at
    // hand — nothing here asserts who created the property, only who books.
    clientUserId = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`,
      clientUserId,
      `booking-client-${suffix}@test.local`,
      JSON.stringify({ role: "CLIENT", name: "Booking Client" })
    );

    const org = await prisma.organization.create({
      data: {
        name: `Booking Org ${suffix}`,
        siret: String(Date.now()).padEnd(14, "4").slice(0, 14),
        email: `booking-org-${suffix}@test.local`,
        address: "1 rue Test",
        city: "Paris",
        postalCode: "75001",
      },
    });
    orgId = org.id;

    const property = await prisma.property.create({
      data: {
        label: "Booking Property",
        propertyType: "OFFICE",
        addressLine1: "1 rue Test",
        city: "Paris",
        postalCode: "75001",
        createdByProfileId: clientUserId,
        owners: { create: { organizationId: orgId, ownershipShareBasisPoints: 10000 } },
        operators: { create: { organizationId: orgId } },
      },
    });
    propertyId = property.id;

    const space = await prisma.space.create({
      data: {
        propertyId,
        organizationId: orgId,
        slug: `booking-space-${suffix}`,
        name: "Booking Space",
        type: "MEETING_ROOM",
        description: "Used by createBooking tests",
        address: "1 rue Test",
        city: "Paris",
        postalCode: "75001",
        capacity: 10,
        amenities: [],
        photos: [],
        halfDayPriceCents: 9000,
        dayPriceCents: 15000,
        status: "PUBLISHED",
        openingHours: {
          create: [{ weekday: 1, opensAt: "09:00", closesAt: "18:00" }],
        },
      },
    });
    spaceId = space.id;
  });

  afterAll(async () => {
    // Guard every id: if beforeAll failed partway these are undefined, and
    // Prisma reads `where: { id: undefined }` as "no filter" — deleting
    // every row in the table rather than this test's own.
    if (orgId) {
      await prisma.payment.deleteMany({ where: { organizationId: orgId } });
      await prisma.booking.deleteMany({ where: { organizationId: orgId } });
      await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    }
    if (spaceId) {
      await prisma.spaceOpeningHours.deleteMany({ where: { spaceId } });
      await prisma.space.deleteMany({ where: { id: spaceId } });
    }
    if (propertyId) await prisma.property.deleteMany({ where: { id: propertyId } });
    if (orgId) await prisma.organization.deleteMany({ where: { id: orgId } });
    if (clientUserId) {
      await prisma.$executeRawUnsafe(`DELETE FROM auth.users WHERE id = $1`, clientUserId);
    }
    await prisma.$disconnect();
  });

  it("ignores a price sent by the caller and uses the space's own price", async () => {
    const { booking } = await createBooking(clientUserId, {
      spaceId,
      date,
      slot: "MORNING",
      participantsCount: 2,
      purpose: "Prix serveur",
      acceptTerms: true,
      // Not part of CreateBookingInput — deliberately smuggled in to prove
      // it has no effect even if it reaches this layer.
      ...({ priceAmountCents: 1, commissionAmountCents: 0 } as object),
    } as Parameters<typeof createBooking>[1]);

    expect(booking.priceAmountCents).toBe(9000);
    expect(booking.commissionAmountCents).toBe(1350); // 15% of 9000
    // B-11: the CGV acceptance is stamped by the server, with its own version.
    const { CGV_VERSION } = await import("@/lib/legal-versions");
    expect(booking.cgvVersion).toBe(CGV_VERSION);
    expect(booking.cgvAcceptedAt).toBeInstanceOf(Date);

    const payment = await prisma.payment.findUnique({ where: { bookingId: booking.id } });
    expect(payment?.amountCents).toBe(9000);
    expect(payment?.netAmountCents).toBe(7650);
    expect(payment?.status).toBe("REQUIRES_CAPTURE");
  });

  it("rejects a second booking overlapping the first with a conflict, not a crash", async () => {
    // The morning slot is taken by the previous test; the full day
    // overlaps it, so the exclusion constraint must reject this.
    await expect(
      createBooking(clientUserId, {
        spaceId,
        date,
        slot: "FULL_DAY",
        participantsCount: 2,
        purpose: "Chevauchement",
        acceptTerms: true,
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows a non-overlapping slot on the same day", async () => {
    const { booking } = await createBooking(clientUserId, {
      spaceId,
      date,
      slot: "AFTERNOON",
      participantsCount: 3,
      purpose: "Après-midi",
      acceptTerms: true,
    });
    expect(booking.priceAmountCents).toBe(9000);
  });

  it("refuses a date the space is closed on", async () => {
    await expect(
      createBooking(clientUserId, {
        spaceId,
        date: "2031-06-01", // Sunday, no opening hours configured
        slot: "FULL_DAY",
        participantsCount: 2,
        purpose: "Dimanche",
        acceptTerms: true,
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("leaves no booking behind when payments are misconfigured in production", async () => {
    // Regression (lot 1 review): the provider used to be resolved after the
    // booking insert, so a 503 from a misconfigured provider left a PENDING
    // booking with no Payment — locking the slot forever, since
    // expire-stale.ts skips bookings without a payment.
    const { resetPaymentProviderForTests } = await import(
      "@/server/domains/payments/get-payment-provider"
    );
    const freeDate = "2031-06-09"; // the next Monday, untouched by other tests
    resetPaymentProviderForTests();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OFFICEFLEX_DEMO_MODE", "");
    vi.stubEnv("PAYMENT_PROVIDER", "");
    try {
      await expect(
        createBooking(clientUserId, {
          spaceId,
          date: freeDate,
          slot: "MORNING",
          participantsCount: 2,
          purpose: "Paiement mal configuré",
          acceptTerms: true,
        })
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      vi.unstubAllEnvs();
      resetPaymentProviderForTests();
    }

    const leftovers = await prisma.booking.count({
      where: {
        spaceId,
        startsAt: { gte: new Date(`${freeDate}T00:00:00Z`), lt: new Date("2031-06-10T00:00:00Z") },
      },
    });
    expect(leftovers).toBe(0);
  });
});
