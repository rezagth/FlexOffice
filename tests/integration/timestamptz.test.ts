import { beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";
import {
  createTestOrganization,
  createTestSpace,
  createTestUser,
} from "./helpers/test-fixtures";

/**
 * Timezone-aware temporal columns, and the exclusion constraint rebuilt on
 * `tstzrange` (migration 20260903101000).
 *
 * Prisma's default mapping for `DateTime` is `timestamp(3)` WITHOUT time
 * zone, so all 23 temporal columns were storing wall-clock readings rather
 * than instants, and `bookings_no_overlap_excl` compared them with `tsrange`.
 * That only works while every writer implicitly agrees on one offset for
 * ever. The failure it hides is the important one: two bookings can denote
 * the same real hour while looking non-overlapping, and the constraint
 * accepts both.
 */
describe.skipIf(!hasDatabase)("timezone-aware temporal columns", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let orgId: string;
  let spaceId: string;
  let clientUserId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    const org = await createTestOrganization();
    orgId = org.id;
    const space = await createTestSpace(orgId);
    spaceId = space.id;
    const user = await createTestUser();
    clientUserId = user.id;
  });

  it("leaves no temporal column without a time zone", async () => {
    const naked = await prisma.$queryRaw<Array<{ column: string }>>`
      SELECT table_name || '.' || column_name AS "column"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type = 'timestamp without time zone'
      ORDER BY 1
    `;

    expect(
      naked.map((row) => row.column),
      "A temporal column has no time zone. Prisma maps `DateTime` to " +
        "`timestamp(3)` by default — add `@db.Timestamptz(3)` to the field " +
        "and an ALTER in the migration."
    ).toEqual([]);
  });

  it("builds the anti-double-booking constraint on tstzrange, not tsrange", async () => {
    const [constraint] = await prisma.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'bookings_no_overlap_excl'
    `;

    expect(constraint?.definition).toContain("tstzrange");
    expect(constraint?.definition).not.toContain("tsrange(");
    // Semantics must be unchanged: still scoped to live bookings only, so a
    // cancelled or completed slot can be rebooked.
    expect(constraint?.definition).toContain("PENDING");
    expect(constraint?.definition).toContain("CONFIRMED");
  });

  /**
   * The behavioural test, and the reason the migration exists.
   *
   * Both inserts use a naked timestamp literal, which PostgreSQL interprets
   * in the *session* time zone. The two literals below denote the same
   * instant: 10:00 in Europe/Paris (UTC+1 in January) is 09:00 UTC.
   *
   * With `timestamptz` + `tstzrange`, the second insert conflicts — correct.
   * With the previous `timestamp` + `tsrange`, the stored values would have
   * been 09:00–12:00 and 10:00–13:00, which do overlap here, but shift the
   * pair across a DST boundary and they stop overlapping while still naming
   * the same hour. Raw SQL is used deliberately: Prisma normalises a JS
   * `Date` to UTC before sending it, which masks the whole class of bug.
   */
  it("detects an overlap between two sessions using different time zones", async () => {
    await prisma.$executeRawUnsafe(`SET LOCAL TimeZone = 'UTC'`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO bookings (
         id, space_id, organization_id, client_user_id, starts_at, ends_at,
         status, participants_count, purpose,
         price_amount_cents, commission_amount_cents, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3,
         '2027-01-10 09:00:00', '2027-01-10 12:00:00',
         'CONFIRMED', 2, 'tz fixture UTC', 12000, 1800, now()
       )`,
      spaceId,
      orgId,
      clientUserId
    );

    // Same instants, expressed as Paris local time.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL TimeZone = 'Europe/Paris'`);
        await tx.$executeRawUnsafe(
          `INSERT INTO bookings (
             id, space_id, organization_id, client_user_id, starts_at, ends_at,
             status, participants_count, purpose,
             price_amount_cents, commission_amount_cents, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3,
             '2027-01-10 10:00:00', '2027-01-10 13:00:00',
             'CONFIRMED', 2, 'tz fixture Paris', 12000, 1800, now()
           )`,
          spaceId,
          orgId,
          clientUserId
        );
      })
    ).rejects.toThrow(/bookings_no_overlap_excl/);

    await prisma.booking.deleteMany({ where: { spaceId, purpose: "tz fixture UTC" } });
  });

  it("round-trips an instant unchanged through Prisma", async () => {
    const startsAt = new Date("2027-02-15T08:30:00.000Z");
    const endsAt = new Date("2027-02-15T11:30:00.000Z");

    const booking = await prisma.booking.create({
      data: {
        spaceId,
        organizationId: orgId,
        clientUserId,
        startsAt,
        endsAt,
        participantsCount: 2,
        purpose: "round trip",
        priceAmountCents: 12000,
        commissionAmountCents: 1800,
      },
    });

    const reloaded = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(reloaded.startsAt.toISOString()).toBe(startsAt.toISOString());
    expect(reloaded.endsAt.toISOString()).toBe(endsAt.toISOString());

    await prisma.booking.delete({ where: { id: booking.id } });
  });
});
