-- Prevents double-booking at the database level, independent of any
-- application-level "check then insert" logic (which is vulnerable to
-- concurrent requests). Prisma cannot express PostgreSQL EXCLUDE
-- constraints, so this migration is hand-written.
--
-- Two PENDING/CONFIRMED bookings for the same space can never have
-- overlapping [starts_at, ends_at) ranges. CANCELLED/REJECTED/COMPLETED
-- bookings are excluded so a freed-up or finished slot can be rebooked.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap_excl"
  EXCLUDE USING gist (
    "space_id" WITH =,
    tsrange("starts_at", "ends_at") WITH &&
  )
  WHERE (status IN ('PENDING', 'CONFIRMED'));
