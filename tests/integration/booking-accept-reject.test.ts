import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * Object-level authorization and idempotency for the partner's accept /
 * reject actions:
 *  - an organization acting on another organization's request gets 404,
 *    never 403 (a 403 would confirm the request exists);
 *  - accepting the same request twice is a conflict, not a double capture.
 */
describe.skipIf(!hasDatabase)("accept/reject booking requests", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let acceptBookingRequest: typeof import("@/server/domains/bookings/accept-reject").acceptBookingRequest;
  let rejectBookingRequest: typeof import("@/server/domains/bookings/accept-reject").rejectBookingRequest;
  let createBooking: typeof import("@/server/domains/bookings/create-booking").createBooking;
  let ConflictError: typeof import("@/server/lib/errors").ConflictError;
  let NotFoundError: typeof import("@/server/lib/errors").NotFoundError;

  let orgAId: string;
  let orgBId: string;
  let spaceId: string;
  let clientUserId: string;
  const date = "2031-07-07"; // a Monday

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    ({ acceptBookingRequest, rejectBookingRequest } = await import(
      "@/server/domains/bookings/accept-reject"
    ));
    ({ createBooking } = await import("@/server/domains/bookings/create-booking"));
    ({ ConflictError, NotFoundError } = await import("@/server/lib/errors"));

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({
        data: {
          name: `Accept Org A ${suffix}`,
          siret: String(Date.now()).padEnd(14, "5").slice(0, 14),
          email: `accept-a-${suffix}@test.local`,
          address: "1 rue A",
          city: "Paris",
          postalCode: "75001",
        },
      }),
      prisma.organization.create({
        data: {
          name: `Accept Org B ${suffix}`,
          siret: String(Date.now() + 1).padEnd(14, "6").slice(0, 14),
          email: `accept-b-${suffix}@test.local`,
          address: "1 rue B",
          city: "Lyon",
          postalCode: "69001",
        },
      }),
    ]);
    orgAId = orgA.id;
    orgBId = orgB.id;

    const space = await prisma.space.create({
      data: {
        organizationId: orgAId,
        slug: `accept-space-${suffix}`,
        name: "Accept Space",
        type: "MEETING_ROOM",
        description: "Used by accept/reject tests",
        address: "1 rue A",
        city: "Paris",
        postalCode: "75001",
        capacity: 10,
        amenities: [],
        photos: [],
        halfDayPriceCents: 8000,
        dayPriceCents: 14000,
        status: "PUBLISHED",
        openingHours: { create: [{ weekday: 1, opensAt: "09:00", closesAt: "18:00" }] },
      },
    });
    spaceId = space.id;

    clientUserId = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`,
      clientUserId,
      `accept-client-${suffix}@test.local`,
      JSON.stringify({ role: "CLIENT", name: "Accept Client" })
    );
  });

  afterAll(async () => {
    // Guard every id: if beforeAll failed partway these are undefined, and
    // Prisma reads `where: { id: undefined }` as "no filter" — deleting
    // every row in the table rather than this test's own.
    if (orgAId && orgBId) {
      const orgs = { in: [orgAId, orgBId] };
      await prisma.payment.deleteMany({ where: { organizationId: orgs } });
      await prisma.booking.deleteMany({ where: { organizationId: orgs } });
      await prisma.auditLog.deleteMany({ where: { organizationId: orgs } });
    }
    if (spaceId) {
      await prisma.spaceOpeningHours.deleteMany({ where: { spaceId } });
      await prisma.space.deleteMany({ where: { id: spaceId } });
    }
    if (orgAId && orgBId) {
      await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    }
    if (clientUserId) {
      await prisma.$executeRawUnsafe(`DELETE FROM auth.users WHERE id = $1`, clientUserId);
    }
    await prisma.$disconnect();
  });

  it("returns 404-shaped NotFoundError when another organization tries to accept", async () => {
    const booking = await createBooking(clientUserId, {
      spaceId,
      date,
      slot: "MORNING",
      participantsCount: 2,
      purpose: "Isolation",
    });

    await expect(acceptBookingRequest(orgBId, booking.id)).rejects.toBeInstanceOf(NotFoundError);

    // Untouched by the foreign organization's attempt.
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("PENDING");
  });

  it("confirms the booking on accept and rejects a second accept as a conflict", async () => {
    const booking = await prisma.booking.findFirstOrThrow({
      where: { spaceId, status: "PENDING" },
    });

    await acceptBookingRequest(orgAId, booking.id);

    const confirmed = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(confirmed.status).toBe("CONFIRMED");
    const payment = await prisma.payment.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(payment.status).toBe("SUCCEEDED");
    expect(payment.capturedAt).not.toBeNull();

    await expect(acceptBookingRequest(orgAId, booking.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("frees the slot on reject, letting the same slot be booked again", async () => {
    const booking = await createBooking(clientUserId, {
      spaceId,
      date,
      slot: "AFTERNOON",
      participantsCount: 2,
      purpose: "À refuser",
    });

    await rejectBookingRequest(orgAId, booking.id);

    const rejected = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(rejected.status).toBe("REJECTED");
    const payment = await prisma.payment.findUniqueOrThrow({ where: { bookingId: booking.id } });
    expect(payment.status).toBe("FAILED");

    // The exclusion constraint only covers PENDING/CONFIRMED, so the slot
    // is bookable again — this is what makes reject non-destructive.
    const rebooked = await createBooking(clientUserId, {
      spaceId,
      date,
      slot: "AFTERNOON",
      participantsCount: 2,
      purpose: "Re-réservation",
    });
    expect(rebooked.status).toBe("PENDING");
  });
});
