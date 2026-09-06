-- Monthly per-partner Stripe Invoice statements of commission already
-- collected at charge-capture time (destination-charge split) — a
-- retrospective record, not a new collection attempt. @@unique on
-- (organization_id, period_start) makes re-running a month idempotent.
-- RLS + revoked anon/authenticated grants in this same migration, same as
-- every other new table (officeflex-security-guardrails §3).
--
-- Also adds Organization.stripe_customer_id: the org as a bill-to party for
-- these statements, distinct from stripe_account_id (its Connect payee id).

ALTER TABLE "organizations" ADD COLUMN "stripe_customer_id" TEXT;

CREATE TABLE "commission_statements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "stripe_invoice_id" TEXT NOT NULL,
    "total_commission_amount_cents" INTEGER NOT NULL,
    "hosted_invoice_url" TEXT NOT NULL,
    "invoice_pdf_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_statements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commission_statements_stripe_invoice_id_key" ON "commission_statements"("stripe_invoice_id");

CREATE UNIQUE INDEX "commission_statements_organization_id_period_start_key" ON "commission_statements"("organization_id", "period_start");

ALTER TABLE "commission_statements" ADD CONSTRAINT "commission_statements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commission_statements" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.commission_statements FROM %I', v_role);
    END IF;
  END LOOP;
END $$;
