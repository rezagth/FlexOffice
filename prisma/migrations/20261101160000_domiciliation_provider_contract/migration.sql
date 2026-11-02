-- Domiciliation is provided by a licensed domiciliataire (agrément
-- préfectoral), MakomSpace being the interface. Columns on existing tables
-- (already under RLS): no new grant. The offer stays disabled until an admin
-- fills the provider and switches it on.
ALTER TABLE "domiciliation_settings"
  ADD COLUMN "domiciliataire_name" TEXT,
  ADD COLUMN "domiciliataire_agrement_number" TEXT;

ALTER TABLE "domiciliation_requests"
  ADD COLUMN "contract_accepted_at" TIMESTAMPTZ(3),
  ADD COLUMN "contract_version" TEXT;
