-- DAC7: tax identity collected from landlords before their first payout.
-- Columns on an existing table (already under RLS): no new grant. Existing
-- organizations start at NULL and fill it in from the payouts page.
ALTER TABLE "organizations"
  ADD COLUMN "tax_residence_country" TEXT,
  ADD COLUMN "tax_identification_number" TEXT,
  ADD COLUMN "representative_birth_date" DATE;
