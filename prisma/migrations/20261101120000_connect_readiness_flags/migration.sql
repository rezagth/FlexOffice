-- C1: cache of the Stripe Connect readiness of each landlord organization.
-- Columns on an existing table (already under RLS, anon/authenticated revoked):
-- no new table, so no new grant to review. Existing organizations start at
-- false and are refreshed from Stripe by the maintenance sweep.
ALTER TABLE "organizations"
  ADD COLUMN "stripe_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stripe_payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stripe_status_synced_at" TIMESTAMPTZ(3);
