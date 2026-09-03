import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";
import {
  createTestOrganization,
  createTestSpace,
  createTestUser,
  deleteTestUser,
} from "./helpers/test-fixtures";

// Proves the double-booking protection lives in the database itself
// (prisma/migrations/..._booking_exclusion_constraint), not just in
// application code — two concurrent inserts for the same space and an
// overlapping time range must never both succeed, regardless of how the
// application-level "check availability then insert" logic behaves.
describe.skipIf(!hasDatabase)("bookings_no_overlap_excl (DB-level, concurrent)", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let orgId: string;
  let spaceId: string;
  let clientUserId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));

    // The test user is created by INSERTing into auth.users, which lets the
    // real `handle_new_user` trigger create the profile. That removes the
    // Supabase dependency from a test that is really about a database
    // constraint — so it now runs in CI against an ephemeral PostgreSQL.
    const user = await createTestUser({ role: "CLIENT", name: "Booking Test Client" });
    clientUserId = user.id;

    const org = await createTestOrganization({ name: "Test Org Booking" });
    orgId = org.id;

    const space = await createTestSpace(orgId, { capacity: 4 });
    spaceId = space.id;
  });

  afterAll(async () => {
    // Guard every id: if beforeAll failed partway, these are undefined,
    // and Prisma reads `where: { id: undefined }` as "no filter" — which
    // would delete every row in the table instead of the test's own.
    if (spaceId) {
      await prisma.booking.deleteMany({ where: { spaceId } });
      await prisma.space.deleteMany({ where: { id: spaceId } });
    }
    if (orgId) await prisma.organization.deleteMany({ where: { id: orgId } });
    if (clientUserId) await deleteTestUser(clientUserId);
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
