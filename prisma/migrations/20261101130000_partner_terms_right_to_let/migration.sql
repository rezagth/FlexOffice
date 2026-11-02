-- Legal: proof of the landlord's acceptance of the partner CGV (billing
-- mandate) and of the per-space declaration of the right to let the place.
-- Columns on existing tables (already under RLS): no new table or grant.
-- Existing organizations/spaces start at NULL: they must accept at the next
-- submission.
ALTER TABLE "organizations"
  ADD COLUMN "partner_terms_accepted_at" TIMESTAMPTZ(3),
  ADD COLUMN "partner_terms_version" TEXT,
  ADD COLUMN "partner_terms_accepted_by_profile_id" UUID;

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_partner_terms_pair_check"
  CHECK (("partner_terms_accepted_at" IS NULL) = ("partner_terms_version" IS NULL));

ALTER TABLE "spaces"
  ADD COLUMN "right_to_let_certified_at" TIMESTAMPTZ(3),
  ADD COLUMN "right_to_let_certified_by_profile_id" UUID;
