-- A real Stripe chargeback, distinct from the app-level `disputes` table
-- (client/partner booking complaints). Recorded for visibility only — the
-- platform absorbs chargeback losses, no automatic transfer reversal.
-- RLS + revoked anon/authenticated grants in this same migration, same as
-- every other new table (officeflex-security-guardrails §3): this is only
-- ever written by the Stripe webhook handler through Prisma, never via
-- PostgREST.

CREATE TYPE "StripeDisputeStatus" AS ENUM (
    'WARNING_NEEDS_RESPONSE',
    'WARNING_UNDER_REVIEW',
    'WARNING_CLOSED',
    'NEEDS_RESPONSE',
    'UNDER_REVIEW',
    'CHARGE_REFUNDED',
    'WON',
    'LOST'
);

CREATE TABLE "stripe_disputes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "provider_dispute_id" TEXT NOT NULL,
    "status" "StripeDisputeStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stripe_disputes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stripe_disputes_provider_dispute_id_key" ON "stripe_disputes"("provider_dispute_id");

CREATE INDEX "stripe_disputes_payment_id_idx" ON "stripe_disputes"("payment_id");

ALTER TABLE "stripe_disputes" ADD CONSTRAINT "stripe_disputes_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stripe_disputes" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.stripe_disputes FROM %I', v_role);
    END IF;
  END LOOP;
END $$;
