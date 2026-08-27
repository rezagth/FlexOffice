import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasRealBackend } from "./helpers/should-run";

// Proves the double-booking protection lives in the database itself
// (prisma/migrations/..._booking_exclusion_constraint), not just in
// application code — two concurrent inserts for the same space and an
// overlapping time range must never both succeed, regardless of how the
// application-level "check availability then insert" logic behaves.
describe.skipIf(!hasRealBackend)("bookings_no_overlap_excl (DB-level, concurrent)", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let admin: ReturnType<typeof import("@/server/auth/supabase-admin").createSupabaseAdminClient>;
  let orgId: string;
  let spaceId: string;
  let clientUserId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    const { createSupabaseAdminClient } = await import("@/server/auth/supabase-admin");
    admin = createSupabaseAdminClient();

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const { data, error } = await admin.auth.admin.createUser({
      email: `booking-test-${suffix}@test.officeflex.local`,
      password: "supersecret",
      email_confirm: true,
      user_metadata: { role: "CLIENT", name: "Booking Test Client" },
    });
    if (error || !data.user) throw error ?? new Error("failed to create test user");
    clientUserId = data.user.id;

    const org = await prisma.organization.create({
      data: {
        name: `Test Org Booking ${suffix}`,
        siret: String(Date.now()).padEnd(14, "3").slice(0, 14),
        email: `org-booking-${suffix}@test.local`,
        address: "1 rue Test",
        city: "Paris",
        postalCode: "75001",
      },
    });
    orgId = org.id;

    const space = await prisma.space.create({
      data: {
        organizationId: orgId,
        slug: `space-booking-${suffix}`,
        name: "Space Booking Test",
        type: "MEETING_ROOM",
        description: "Used to test the exclusion constraint",
        address: "1 rue Test",
        city: "Paris",
        postalCode: "75001",
        capacity: 4,
        amenities: [],
        photos: [],
        halfDayPriceCents: 1000,
        dayPriceCents: 2000,
        status: "PUBLISHED",
      },
    });
    spaceId = space.id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { spaceId } });
    await prisma.space.deleteMany({ where: { id: spaceId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await admin.auth.admin.deleteUser(clientUserId);
    await prisma.$disconnect();
  });

  it("lets only one of two concurrent overlapping bookings succeed", async () => {
    const startsAt = new Date("2030-01-01T09:00:00Z");
    const endsAt = new Date("2030-01-01T11:00:00Z");

    const attempt = () =>
      prisma.booking.create({
        data: {
          spaceId,
          organizationId: orgId,
          clientUserId,
          startsAt,
          endsAt,
          status: "CONFIRMED",
          participantsCount: 2,
          purpose: "Concurrency test",
          priceAmountCents: 2000,
          commissionAmountCents: 300,
        },
      });

    const results = await Promise.allSettled([attempt(), attempt()]);
    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
  });

  it("allows a non-overlapping booking for the same space", async () => {
    const booking = await prisma.booking.create({
      data: {
        spaceId,
        organizationId: orgId,
        clientUserId,
        startsAt: new Date("2030-01-02T09:00:00Z"),
        endsAt: new Date("2030-01-02T11:00:00Z"),
        status: "CONFIRMED",
        participantsCount: 2,
        purpose: "Non-overlapping",
        priceAmountCents: 2000,
        commissionAmountCents: 300,
      },
    });
    expect(booking.id).toBeTruthy();
  });
});
