-- Move every temporal column to `timestamp with time zone`, and rebuild the
-- anti-double-booking constraint on `tstzrange`.
--
-- THE PROBLEM
-- Prisma's default mapping for `DateTime` on PostgreSQL is
-- `timestamp(3)` — WITHOUT time zone. All 23 temporal columns were created
-- that way, and `bookings_no_overlap_excl` (migration
-- 20260101000200) therefore compared naked wall-clock values via `tsrange`.
--
-- A `timestamp without time zone` does not identify an instant. It only
-- happens to work while every writer agrees, implicitly and forever, on one
-- offset. The failure modes are concrete:
--   * DST: 02:30 exists twice on the autumn transition and never on the
--     spring one. Two bookings can be stored as non-overlapping wall-clock
--     ranges while denoting the same real hour — the EXCLUDE constraint sees
--     no conflict and both are accepted.
--   * A client in another time zone, or a server whose TZ differs from the
--     one assumed, silently shifts every slot.
--   * The brief's own trajectory ("croissance multi-villes sans refonte")
--     makes a single implicit offset untenable.
--
-- WHICH TIME ZONE THE OLD VALUES ARE INTERPRETED IN
-- Explicitly UTC — `USING "col" AT TIME ZONE 'UTC'`.
-- Justification, not a guess: every existing write goes through Prisma with
-- `@prisma/adapter-pg`, which sends a JavaScript `Date` normalised to UTC.
-- The naked values already stored are therefore UTC wall-clock readings, and
-- reinterpreting them as UTC preserves each instant exactly. No value is
-- shifted, rewritten or lost.
--
-- Had the data come from mixed writers, this migration would not have been
-- safe to run unattended and the offset would have needed a per-row decision.
-- That is why the interpretation is spelled out here rather than left to the
-- session's `TimeZone` setting (which is what an unqualified
-- `ALTER COLUMN ... TYPE timestamptz` would silently use).
--
-- SCOPE
-- All 23 legacy columns, not only `bookings`. Mixing the two types across a
-- schema is how the next comparison bug gets written: a join or a `BETWEEN`
-- between a `timestamp` and a `timestamptz` applies an implicit conversion
-- using the session time zone, which is exactly the trap being closed here.
--
-- That mixing has already started: `profiles.deleted_at`, added by
-- `20260830130100_profile_gdpr_deletion`, is correctly `TIMESTAMPTZ`, while
-- every column around it is not. This migration removes the discrepancy
-- rather than letting the schema settle into two conventions.
--
-- NOT IN SCOPE, and deliberately so: `space_opening_hours.opens_at` /
-- `closes_at` stay TEXT "HH:mm". They are wall-clock rules, not instants —
-- "we open at 09:00" does not move with the offset — and
-- `20260830141000_space_timezone` already put the zone that resolves them on
-- the Space. Converting them to a timestamp type would be wrong, not safer.
-- The two changes are complementary: that migration says which zone to read
-- the rules in, this one makes the resulting instants comparable.
--
-- RISK / LOCKING
-- `ALTER COLUMN ... TYPE` rewrites the table and takes an ACCESS EXCLUSIVE
-- lock. On the current data volume (a demo seed at most) this is instant. On
-- a populated production database it would need a maintenance window — which
-- is precisely why it is being done now, before any real booking exists.
--
-- ROLLBACK
-- Symmetrical and lossless: drop the constraint, `ALTER COLUMN ... TYPE
-- timestamp(3) USING "col" AT TIME ZONE 'UTC'` (the inverse expression), then
-- recreate the constraint with `tsrange`. See section MIGRATIONS DB of the
-- Phase 1 report.

-- 1. The exclusion constraint depends on the two columns being retyped, so it
--    has to go first. It is recreated at the end of this same migration —
--    inside the same transaction Prisma wraps around the file, so there is no
--    window where double-booking is unprotected.
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_no_overlap_excl";

-- 2. Business-critical instants: booking slots and closure periods.
ALTER TABLE "bookings"
  ALTER COLUMN "starts_at" TYPE timestamptz(3) USING "starts_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "ends_at"   TYPE timestamptz(3) USING "ends_at"   AT TIME ZONE 'UTC';

ALTER TABLE "space_closures"
  ALTER COLUMN "starts_at" TYPE timestamptz(3) USING "starts_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "ends_at"   TYPE timestamptz(3) USING "ends_at"   AT TIME ZONE 'UTC';

-- 3. Payment lifecycle instants.
ALTER TABLE "payments"
  ALTER COLUMN "captured_at" TYPE timestamptz(3) USING "captured_at" AT TIME ZONE 'UTC';

ALTER TABLE "webhook_events"
  ALTER COLUMN "processed_at" TYPE timestamptz(3) USING "processed_at" AT TIME ZONE 'UTC';

-- 4. Record-keeping columns. Same reasoning: an audit trail or an invoice date
--    that cannot be placed on a real timeline is not an audit trail.
ALTER TABLE "profiles"
  ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "organizations"
  ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "spaces"
  ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "bookings"
  ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "payments"
  ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "refunds"
  ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "disputes"
  ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "dispute_events"
  ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';

ALTER TABLE "favorites"
  ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';

ALTER TABLE "audit_logs"
  ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';

-- `profiles.deleted_at` was already `timestamptz` — but declared without a
-- precision, so PostgreSQL gave it the default of 6 while every column Prisma
-- generates is 3. Left alone, that one column is permanent schema drift:
-- `prisma migrate dev` would keep offering to "fix" it on every future run.
-- Normalised here rather than annotated as (6) in the schema, so the whole
-- schema keeps one precision. No conversion, no data change — only the
-- declared precision.
ALTER TABLE "profiles"
  ALTER COLUMN "deleted_at" TYPE timestamptz(3);

-- 5. Rebuild the exclusion constraint on `tstzrange`.
--    Semantics are unchanged and deliberately preserved: same space, same
--    half-open range overlap test, still restricted to PENDING/CONFIRMED so a
--    cancelled or completed slot can be rebooked. The only difference is that
--    the ranges now compare instants instead of wall-clock readings.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap_excl"
  EXCLUDE USING gist (
    "space_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  )
  WHERE (status IN ('PENDING', 'CONFIRMED'));
