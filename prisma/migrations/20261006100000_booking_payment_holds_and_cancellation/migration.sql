-- Lot 2 (payments), audit 06/10/2026 B-03 / B-04 / B-02.
--
-- 1. A booking used to become PENDING — visible to the landlord, slot
--    locked — before the client's card was authorized. AWAITING_PAYMENT is
--    the state in between; PENDING now means "authorized, waiting for the
--    landlord". The matching payment state is AWAITING_AUTHORIZATION.
--
--    New enum values cannot be used in the transaction that adds them, so
--    the exclusion constraint that must cover AWAITING_PAYMENT is rebuilt
--    in the next migration (20261006100100).
--
-- 2. Cancellation: who cancelled, and when (status CANCELLED already
--    existed and was never written).
--
-- 3. Refunds record how they were funded: the share taken back from the
--    landlord (Stripe transfer reversal) and whether the platform's
--    commission was refunded.
--
-- No new table, so no RLS change: bookings and refunds keep the RLS and
-- revoked anon/authenticated privileges set in 20260830140000.

ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT' BEFORE 'PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'AWAITING_AUTHORIZATION' BEFORE 'REQUIRES_CAPTURE';

CREATE TYPE "CancellationActor" AS ENUM ('CLIENT', 'LANDLORD', 'SYSTEM');
-- Types are not covered by table privileges; nothing to revoke for anon.

ALTER TABLE "bookings"
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(3),
  ADD COLUMN "cancelled_by" "CancellationActor";

-- A cancellation records both facts or neither.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_cancellation_fields_together_check"
    CHECK (("cancelled_at" IS NULL) = ("cancelled_by" IS NULL));

ALTER TABLE "refunds"
  ADD COLUMN "landlord_reversal_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "application_fee_refunded" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_landlord_reversal_within_amount_check"
    CHECK ("landlord_reversal_cents" >= 0 AND "landlord_reversal_cents" <= "amount_cents");
