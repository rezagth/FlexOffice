-- Legal invoicing documents (lot F — audit B-12, B-13).
--
-- Until now an "invoice" was a Payment rendered on screen, numbered
-- `OF-<year>-<uuid prefix>`: not sequential, no seller identity, no VAT, and
-- it changed whenever the landlord edited their organization. French law
-- (CGI art. 242 nonies A) wants a chronological, continuous numbering per
-- issuer and an immutable document.
--
--   invoice_number_counters  one row per (series, year). The next number is
--                            taken with INSERT .. ON CONFLICT DO UPDATE ..
--                            RETURNING inside the transaction that inserts
--                            the document: the counter row stays locked
--                            until commit, and a rolled-back issuance rolls
--                            the counter back too — no gap, no duplicate.
--   invoices                 the documents themselves, with a snapshot of
--                            the seller and buyer at issuance:
--                              INVOICE             booking invoice, issued by
--                                                  the platform in the name
--                                                  and on behalf of the
--                                                  landlord (billing mandate)
--                              CREDIT_NOTE         a settled refund, same
--                                                  series as the invoice it
--                                                  credits
--                              COMMISSION_INVOICE  the platform's monthly
--                                                  commission invoice to a
--                                                  landlord (series FC)
--
-- Both tables get RLS + revoked anon/authenticated grants in this same
-- migration (officeflex-security-guardrails §3).

CREATE TYPE "InvoiceKind" AS ENUM ('INVOICE', 'CREDIT_NOTE', 'COMMISSION_INVOICE');

CREATE TABLE "invoice_number_counters" (
    "series_key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_number_counters_pkey" PRIMARY KEY ("series_key", "year"),
    CONSTRAINT "invoice_number_counters_last_value_check" CHECK ("last_value" > 0),
    CONSTRAINT "invoice_number_counters_year_check" CHECK ("year" BETWEEN 2000 AND 2999)
);

CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "InvoiceKind" NOT NULL,
    "series_key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "organization_id" UUID NOT NULL,
    "payment_id" UUID,
    "refund_id" UUID,
    "commission_statement_id" UUID,
    "credited_invoice_id" UUID,
    "seller" JSONB,
    "buyer" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "total_cents" INTEGER NOT NULL,
    "net_cents" INTEGER NOT NULL,
    "vat_cents" INTEGER NOT NULL,
    "vat_rate_basis_points" INTEGER NOT NULL,
    "vat_exempt" BOOLEAN NOT NULL DEFAULT false,
    "service_fee_cents" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoices_sequence_check" CHECK ("sequence" > 0),
    CONSTRAINT "invoices_amounts_check" CHECK (
      "net_cents" >= 0 AND "vat_cents" >= 0 AND "total_cents" = "net_cents" + "vat_cents"
    ),
    CONSTRAINT "invoices_vat_rate_check" CHECK ("vat_rate_basis_points" BETWEEN 0 AND 10000),
    CONSTRAINT "invoices_vat_exempt_check" CHECK (
      NOT "vat_exempt" OR ("vat_cents" = 0 AND "vat_rate_basis_points" = 0)
    ),
    CONSTRAINT "invoices_service_fee_check" CHECK (
      "service_fee_cents" IS NULL OR ("service_fee_cents" >= 0 AND "service_fee_cents" <= "total_cents")
    ),
    -- Exactly the source the kind calls for, nothing else.
    CONSTRAINT "invoices_kind_source_check" CHECK (
      ("kind" = 'INVOICE' AND "payment_id" IS NOT NULL AND "refund_id" IS NULL
         AND "commission_statement_id" IS NULL AND "credited_invoice_id" IS NULL AND "seller" IS NOT NULL)
      OR ("kind" = 'CREDIT_NOTE' AND "payment_id" IS NULL AND "refund_id" IS NOT NULL
         AND "commission_statement_id" IS NULL AND "credited_invoice_id" IS NOT NULL AND "seller" IS NOT NULL)
      OR ("kind" = 'COMMISSION_INVOICE' AND "payment_id" IS NULL AND "refund_id" IS NULL
         AND "commission_statement_id" IS NOT NULL AND "credited_invoice_id" IS NULL)
    )
);

CREATE UNIQUE INDEX "invoices_series_key_year_sequence_key" ON "invoices"("series_key", "year", "sequence");
CREATE UNIQUE INDEX "invoices_series_key_number_key" ON "invoices"("series_key", "number");
CREATE UNIQUE INDEX "invoices_payment_id_key" ON "invoices"("payment_id");
CREATE UNIQUE INDEX "invoices_refund_id_key" ON "invoices"("refund_id");
CREATE UNIQUE INDEX "invoices_commission_statement_id_key" ON "invoices"("commission_statement_id");
CREATE INDEX "invoices_organization_id_kind_issued_at_idx" ON "invoices"("organization_id", "kind", "issued_at");
CREATE INDEX "invoices_credited_invoice_id_idx" ON "invoices"("credited_invoice_id");

-- RESTRICT towards the organization: an issuer's documents never vanish
-- with it. CASCADE from the payment / refund / statement / credited
-- invoice: the application never deletes those rows (bookings are
-- RESTRICT, GDPR deletion anonymizes), so the cascade only ever runs in
-- test cleanup — and the immutability trigger below lets nothing else
-- remove a document.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_refund_id_fkey"
  FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_commission_statement_id_fkey"
  FOREIGN KEY ("commission_statement_id") REFERENCES "commission_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credited_invoice_id_fkey"
  FOREIGN KEY ("credited_invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An issued document is never edited nor deleted directly — a correction
-- is a credit note. pg_trigger_depth() > 1 means this DELETE is the
-- foreign-key cascade of a deleted parent (see above), which is allowed.
CREATE OR REPLACE FUNCTION public.invoices_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'invoices are immutable: issue a credit note instead'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.invoices_immutable() FROM PUBLIC;

CREATE TRIGGER "invoices_immutable"
  BEFORE UPDATE OR DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION public.invoices_immutable();

-- Commission statements: the legal document is now the FC invoice above;
-- Stripe only mirrors it. The statement row is claimed BEFORE Stripe is
-- called (so two concurrent runs cannot create two Stripe invoices), and
-- the Stripe fields are filled in once the mirror succeeds — or never,
-- on an instance without Stripe (PAYMENT_PROVIDER=mock).
ALTER TABLE "commission_statements" ALTER COLUMN "stripe_invoice_id" DROP NOT NULL;
ALTER TABLE "commission_statements" ALTER COLUMN "hosted_invoice_url" DROP NOT NULL;
ALTER TABLE "commission_statements" ALTER COLUMN "invoice_pdf_url" DROP NOT NULL;
ALTER TABLE "commission_statements" ADD COLUMN "stripe_synced_at" TIMESTAMPTZ(3);
ALTER TABLE "commission_statements" ADD COLUMN "stripe_sync_error" TEXT;
ALTER TABLE "commission_statements" ADD CONSTRAINT "commission_statements_total_check"
  CHECK ("total_commission_amount_cents" >= 0);
ALTER TABLE "commission_statements" ADD CONSTRAINT "commission_statements_period_check"
  CHECK ("period_start" < "period_end");

ALTER TABLE "invoice_number_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.invoice_number_counters FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE public.invoices FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.invoices_immutable() FROM %I', v_role);
    END IF;
  END LOOP;
END $$;
