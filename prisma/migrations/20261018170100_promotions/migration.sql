-- PRD V1.1, lot 3, commit 2 — promotions (R34-R39, R48-R52).
--
-- Replaces Space.discountPercent (an unmoderated, instantly-live discount a
-- partner could set directly) with a moderated Promotion: draft -> pending
-- -> published (admin approval) | rejected, applied only server-side, only
-- while published and within its date range and usage cap.
--
-- This migration is NOT additive: it removes "spaces"."discount_percent"
-- after backfilling one PUBLISHED/MIGRATED Promotion per space that had an
-- active discount, in the same transaction — if the backfill insert fails,
-- the column drop never runs either (the whole file is one transaction).
-- There is no automatic rollback. To restore the column by hand:
--   ALTER TABLE "spaces" ADD COLUMN "discount_percent" INTEGER;
--   ALTER TABLE "spaces" ADD CONSTRAINT "spaces_discount_percent_max_check"
--     CHECK ("discount_percent" IS NULL OR ("discount_percent" >= 0 AND "discount_percent" <= 90));
--   -- Repopulating it from the migrated promotions themselves:
--   UPDATE "spaces" s SET "discount_percent" = p."discount_percent"
--   FROM "promotion_spaces" ps JOIN "promotions" p ON p."id" = ps."promotion_id"
--   WHERE ps."space_id" = s."id" AND p."origin" = 'MIGRATED';
-- (existing bookings are untouched either way: their price was already
-- fixed at booking time and never depended on this column.)

CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'EXPIRED');
CREATE TYPE "PromotionDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
CREATE TYPE "PromotionOrigin" AS ENUM ('PARTNER', 'MIGRATED');
CREATE TYPE "PromotionRejectionReason" AS ENUM (
  'INCONSISTENT_PRICE', 'INVALID_DATES', 'INAPPROPRIATE_CONTENT', 'MISSING_INFORMATION', 'OTHER'
);

CREATE TABLE "promotions" (
  "id"                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"        UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "discount_type"          "PromotionDiscountType" NOT NULL,
  "discount_percent"       INTEGER,
  "discount_amount_cents"  INTEGER,
  "starts_at"              TIMESTAMPTZ(3) NOT NULL,
  "ends_at"                TIMESTAMPTZ(3),
  "usage_limit"            INTEGER,
  "usage_count"            INTEGER NOT NULL DEFAULT 0,
  "status"                 "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
  "origin"                 "PromotionOrigin" NOT NULL DEFAULT 'PARTNER',
  "rejection_reason"       "PromotionRejectionReason",
  "rejection_note"         TEXT,
  "created_by_profile_id"  UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "reviewed_by_profile_id" UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "reviewed_at"            TIMESTAMPTZ(3),
  "submitted_at"           TIMESTAMPTZ(3),
  "created_at"             TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

  -- Exactly one of the two discount fields, each in its own sane range —
  -- same "a money-adjacent column always has a CHECK" rule as every other
  -- amount in this schema.
  CONSTRAINT "promotions_discount_consistency_check" CHECK (
    ("discount_type" = 'PERCENTAGE' AND "discount_percent" BETWEEN 1 AND 90 AND "discount_amount_cents" IS NULL)
    OR
    ("discount_type" = 'FIXED_AMOUNT' AND "discount_amount_cents" > 0 AND "discount_percent" IS NULL)
  ),
  CONSTRAINT "promotions_dates_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at"),
  CONSTRAINT "promotions_usage_limit_check" CHECK ("usage_limit" IS NULL OR "usage_limit" > 0),
  CONSTRAINT "promotions_usage_count_check"
    CHECK ("usage_count" >= 0 AND ("usage_limit" IS NULL OR "usage_count" <= "usage_limit")),
  -- A rejection always carries its reason (R48-R52), and "autre" always
  -- carries its free text — same enforcement style as
  -- landlord_verifications_rejection_reason_check.
  CONSTRAINT "promotions_rejection_check" CHECK (
    ("status" <> 'REJECTED' AND "rejection_reason" IS NULL AND "rejection_note" IS NULL)
    OR
    ("status" = 'REJECTED' AND "rejection_reason" IS NOT NULL
      AND ("rejection_reason" <> 'OTHER' OR length(trim("rejection_note")) > 0))
  ),
  -- Only a MIGRATED row may lack a human creator.
  CONSTRAINT "promotions_created_by_check" CHECK ("origin" = 'MIGRATED' OR "created_by_profile_id" IS NOT NULL)
);

CREATE INDEX "promotions_organization_id_idx" ON "promotions" ("organization_id");
-- Backs the admin queue: pending promotions, oldest submitted first.
CREATE INDEX "promotions_status_submitted_at_idx" ON "promotions" ("status", "submitted_at");

ALTER TABLE "promotions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "promotions" FROM anon, authenticated;

CREATE TABLE "promotion_spaces" (
  "promotion_id" UUID NOT NULL REFERENCES "promotions"("id") ON DELETE CASCADE,
  "space_id"     UUID NOT NULL REFERENCES "spaces"("id") ON DELETE CASCADE,
  PRIMARY KEY ("promotion_id", "space_id")
);
CREATE INDEX "promotion_spaces_space_id_idx" ON "promotion_spaces" ("space_id");

ALTER TABLE "promotion_spaces" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "promotion_spaces" FROM anon, authenticated;

-- Price lock-in (R34-R39): a booking keeps the price — and discount
-- breakdown, for the invoice — it was made at, even if its promotion is
-- later edited, refused or expires.
ALTER TABLE "bookings" ADD COLUMN "original_price_amount_cents" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "discount_amount_cents" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "promotion_id" UUID REFERENCES "promotions"("id") ON DELETE SET NULL;

-- Backfill: every booking so far was made with no promotion mechanism at
-- all, so its original price is simply its charged price.
UPDATE "bookings" SET "original_price_amount_cents" = "price_amount_cents", "discount_amount_cents" = 0
WHERE "original_price_amount_cents" IS NULL;

-- No DEFAULT on original_price_amount_cents: unlike discount_amount_cents
-- (0 is always a safe "no discount"), there is no safe universal default
-- for the pre-discount price — every caller must state it explicitly, and
-- bookings_discount_consistency_check below holds it to account.
ALTER TABLE "bookings" ALTER COLUMN "original_price_amount_cents" SET NOT NULL;
ALTER TABLE "bookings" ALTER COLUMN "discount_amount_cents" SET NOT NULL;
ALTER TABLE "bookings" ALTER COLUMN "discount_amount_cents" SET DEFAULT 0;

CREATE INDEX "bookings_promotion_id_idx" ON "bookings" ("promotion_id");

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_discount_consistency_check" CHECK (
  "discount_amount_cents" >= 0
  AND "original_price_amount_cents" = "price_amount_cents" + "discount_amount_cents"
);

-- Backfill: one PUBLISHED/MIGRATED promotion per space with an active
-- discount (discount_percent IS NOT NULL AND > 0 — 0 behaved as "no
-- discount", same falsy check as the application code being replaced).
-- A temp table carries the generated promotion id across both inserts so
-- promotions and promotion_spaces agree on it without a second query.
CREATE TEMP TABLE "_promotion_migration" AS
SELECT gen_random_uuid() AS "promotion_id", "id" AS "space_id", "organization_id", "discount_percent"
FROM "spaces"
WHERE "discount_percent" IS NOT NULL AND "discount_percent" > 0;

INSERT INTO "promotions" (
  "id", "organization_id", "discount_type", "discount_percent", "starts_at", "ends_at",
  "status", "origin", "created_by_profile_id", "reviewed_by_profile_id", "reviewed_at", "submitted_at"
)
SELECT "promotion_id", "organization_id", 'PERCENTAGE', "discount_percent", now(), NULL,
       'PUBLISHED', 'MIGRATED', NULL, NULL, now(), NULL
FROM "_promotion_migration";

INSERT INTO "promotion_spaces" ("promotion_id", "space_id")
SELECT "promotion_id", "space_id" FROM "_promotion_migration";

-- One notification per (organization, active OWNER/ADMIN member) that was
-- actually affected — not one per space, so a partner with several
-- discounted spaces in the same organization gets a single message.
INSERT INTO "notifications" ("id", "recipient_profile_id", "type", "title", "body", "link", "created_at")
SELECT gen_random_uuid(), "om"."profile_id", 'PROMOTION_STATUS_CHANGED',
       'Votre remise a été convertie en promotion',
       'La remise que vous aviez réglée sur un espace a été transformée en promotion active : vous pouvez la consulter et la modifier.',
       '/app/landlord/promotions', now()
FROM (SELECT DISTINCT "organization_id" FROM "_promotion_migration") AS "affected_orgs"
JOIN "organization_members" "om"
  ON "om"."organization_id" = "affected_orgs"."organization_id"
  AND "om"."org_role" IN ('OWNER', 'ADMIN')
  AND "om"."status" = 'ACTIVE';

DROP TABLE "_promotion_migration";

-- The mechanism these promotions replace. Its own CHECK constraint
-- (spaces_discount_percent_max_check) is dropped automatically with the
-- column.
ALTER TABLE "spaces" DROP COLUMN "discount_percent";
