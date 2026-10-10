-- A booking in AWAITING_PAYMENT holds its slot (short-lived, see
-- src/server/domains/bookings/payment-holds.ts): two clients must not be
-- able to enter the card step for the same slot and both get authorized.
-- Separate from 20261006100000 because a new enum value cannot be used in
-- the transaction that added it.
--
-- Dropped and recreated in one transaction (Prisma wraps the file), so
-- there is no window without double-booking protection.
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_no_overlap_excl";

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap_excl"
  EXCLUDE USING gist (
    "space_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  )
  WHERE (status IN ('AWAITING_PAYMENT', 'PENDING', 'CONFIRMED'));
