-- Money rules decided on 10/10/2026:
--   * the platform keeps the client's money until the stay is over, then pays
--     the landlord weekly or monthly (payouts, payout_lines);
--   * each space carries its own cancellation window, copied onto every
--     booking when it is requested.

CREATE TYPE "PayoutFrequency" AS ENUM ('WEEKLY', 'MONTHLY');
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');
CREATE TYPE "PayoutLineKind" AS ENUM ('EARNING', 'CANCELLATION_PENALTY');

ALTER TABLE "organizations" ADD COLUMN "payout_frequency" "PayoutFrequency" NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE "spaces" ADD COLUMN "cancellation_window_hours" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_cancellation_window_hours_check"
  CHECK ("cancellation_window_hours" IN (0, 48, 168, 720));

ALTER TABLE "bookings" ADD COLUMN "cancellation_window_hours" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancellation_window_hours_check"
  CHECK ("cancellation_window_hours" IN (0, 48, 168, 720));

CREATE TABLE "payouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "provider_transfer_id" TEXT,
    "failure_reason" TEXT,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id"),
    -- A payout is only created for a positive total (a negative balance
    -- carries over to the next one).
    CONSTRAINT "payouts_amount_positive_check" CHECK ("amount_cents" > 0)
);

CREATE UNIQUE INDEX "payouts_provider_transfer_id_key" ON "payouts"("provider_transfer_id");
CREATE UNIQUE INDEX "payouts_organization_id_scheduled_for_key" ON "payouts"("organization_id", "scheduled_for");
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

CREATE TABLE "payout_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "kind" "PayoutLineKind" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "eligible_at" TIMESTAMPTZ(3) NOT NULL,
    "payout_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payout_lines_sign_check" CHECK (
      ("kind" = 'EARNING' AND "amount_cents" > 0)
      OR ("kind" = 'CANCELLATION_PENALTY' AND "amount_cents" < 0)
    )
);

CREATE UNIQUE INDEX "payout_lines_booking_id_kind_key" ON "payout_lines"("booking_id", "kind");
CREATE INDEX "payout_lines_organization_id_payout_id_idx" ON "payout_lines"("organization_id", "payout_id");

ALTER TABLE "payouts" ADD CONSTRAINT "payouts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payout_lines" ADD CONSTRAINT "payout_lines_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payout_lines" ADD CONSTRAINT "payout_lines_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payout_lines" ADD CONSTRAINT "payout_lines_payout_id_fkey"
  FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Same hardening as every table in public: row level security on, and no
-- privilege for the roles that ship with the publishable key.
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payout_lines" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.payouts FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE public.payout_lines FROM %I', v_role);
    END IF;
  END LOOP;
END $$;
