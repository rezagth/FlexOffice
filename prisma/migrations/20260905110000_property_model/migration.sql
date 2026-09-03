-- Phase 4 — Property / PropertyOwner / PropertyOperator / PropertyManager.
--
-- WHAT THIS ADDS, CONCEPTUALLY
-- Until now "Organization" did three jobs at once: the legal holder, the
-- entity authorized to let a space, and the thing a Space pointed at
-- directly. That conflation is exactly what makes an agency scenario
-- (owner ≠ operator ≠ manager, three different organizations) unrepresentable.
-- This migration inserts a `Property` — the physical building — between
-- Organization and Space, and three join tables answering three separate
-- questions about it:
--
--   property_owners     who legally possesses the building (profile or
--                        organization, possibly several — co-ownership)
--   property_operators   who is authorized to let it on OfficeFlex (usually
--                        the owner; may be a mandated third party)
--   property_managers    who runs it day to day, without becoming an owner
--                        or receiving revenue
--
-- `spaces.organization_id` is NOT removed. It is still what every existing
-- authorization check reads (Space is still reached through
-- `requireOrg()` + `organizationId`, unchanged this phase). It becomes a
-- redundant, service-layer-checked mirror of "the space's property has this
-- organization as a CURRENT owner or operator" — see
-- `organizations_holder_type_siret_check`-style reasoning in
-- 20260904100000_account_model_expand for the precedent of widening before
-- narrowing. Retiring it in favour of Property-derived authorization is
-- Phase 5+ work; see the Phase 4 report, DETTE TECHNIQUE.
--
-- WHAT IS DELIBERATELY *NOT* HERE
--   * A cross-row CHECK that active owners' shares sum to <= 10000 basis
--     points — a CHECK cannot see other rows. Enforced in
--     src/server/domains/properties/owners.ts, with a test, the same
--     documented trade-off as 20260903110100_business_integrity_constraints.
--   * A CHECK tying spaces.organization_id to its property's current
--     operator/owner — same cross-table reason. Enforced in
--     src/server/domains/organizations/create-space.ts and update-space.ts.
--   * Geocoding: latitude/longitude are nullable columns with no provider
--     behind them yet (explicitly out of Phase 4 scope).
--   * A trigger, RLS policy, or route granting per-property fine-grained
--     permissions from `property_managers.scope` — the column exists,
--     nothing reads it yet.
--
-- RISK
-- Additive except for `spaces.property_id`, which is backfilled in this same
-- migration and then set NOT NULL — every existing space gets a Property, no
-- space is left orphaned, no other space column changes shape or meaning.
-- Backfill groups existing spaces by (organization_id, address, city,
-- postal_code): spaces sharing an exact address become Spaces of the same
-- backfilled Property, everything else gets its own. Verified against the
-- demo seed and every fixture in tests/integration.
--
-- ROLLBACK
-- `ALTER TABLE spaces DROP COLUMN property_id;`, then drop
-- property_managers, property_operators, property_owners, properties (in
-- that order, FKs point inward), then the two new enums. Lossless: nothing
-- outside the new tables and the new column is touched.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

-- Open-ended on purpose ("ne rends pas l'enum inutilement rigide") — OTHER
-- exists so onboarding a property type the business did not anticipate never
-- blocks on a migration.
CREATE TYPE "PropertyType" AS ENUM (
  'OFFICE', 'COMMERCIAL', 'COWORKING', 'MEETING_SPACE', 'RESIDENTIAL', 'MIXED_USE', 'OTHER'
);

CREATE TYPE "PropertyStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- ---------------------------------------------------------------------------
-- 2. properties
-- ---------------------------------------------------------------------------
CREATE TABLE "properties" (
    "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
    "label"                 TEXT NOT NULL,
    "property_type"         "PropertyType" NOT NULL,
    "status"                "PropertyStatus" NOT NULL DEFAULT 'ACTIVE',
    "address_line1"         TEXT NOT NULL,
    "address_line2"         TEXT,
    "postal_code"           TEXT NOT NULL,
    "city"                  TEXT NOT NULL,
    "region"                TEXT,
    "country"               TEXT NOT NULL DEFAULT 'FR',
    "latitude"              DOUBLE PRECISION,
    "longitude"             DOUBLE PRECISION,
    "created_by_profile_id" UUID NOT NULL,
    "created_at"            TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "properties"
  -- RESTRICT: a property must always be able to say who created it. The
  -- creator's own account may still be anonymized (see gdpr.ts) — RESTRICT
  -- only blocks a hard delete, which is exactly what anonymization avoids.
  ADD CONSTRAINT "properties_created_by_profile_id_fkey"
    FOREIGN KEY ("created_by_profile_id") REFERENCES "profiles" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "properties_latitude_range_check"
    CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "properties_longitude_range_check"
    CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "properties_country_format_check"
    CHECK ("country" ~ '^[A-Z]{2}$');

CREATE INDEX "properties_city_idx" ON "properties" ("city");
CREATE INDEX "properties_status_idx" ON "properties" ("status");
CREATE INDEX "properties_created_by_profile_id_idx" ON "properties" ("created_by_profile_id");

ALTER TABLE "properties" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.properties FROM %I', v_role);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. property_owners / property_operators / property_managers
--
-- All three share the same "holder" shape: exactly one of profile_id /
-- organization_id, never both, never neither — a relational alternative to
-- a polymorphic (type, id) pair, so a foreign key (and RLS, later) can still
-- point at the right table directly.
-- ---------------------------------------------------------------------------
CREATE TABLE "property_owners" (
    "id"                            UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id"                   UUID NOT NULL,
    "profile_id"                    UUID,
    "organization_id"               UUID,
    "ownership_share_basis_points"  INTEGER NOT NULL DEFAULT 10000,
    "starts_at"                     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at"                       TIMESTAMPTZ(3),
    "created_at"                    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                    TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "property_owners_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "property_owners"
  ADD CONSTRAINT "property_owners_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "property_owners_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "property_owners_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "property_owners_holder_check"
    CHECK (
      ("profile_id" IS NOT NULL AND "organization_id" IS NULL)
      OR ("profile_id" IS NULL AND "organization_id" IS NOT NULL)
    ),
  -- 10000 = 100%. Never 0: a row with no share is not an owner.
  ADD CONSTRAINT "property_owners_share_range_check"
    CHECK ("ownership_share_basis_points" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "property_owners_ends_after_starts_check"
    CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");

CREATE INDEX "property_owners_property_id_idx" ON "property_owners" ("property_id");
CREATE INDEX "property_owners_profile_id_idx" ON "property_owners" ("profile_id");
CREATE INDEX "property_owners_organization_id_idx" ON "property_owners" ("organization_id");

ALTER TABLE "property_owners" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.property_owners FROM %I', v_role);
    END IF;
  END LOOP;
END $$;

CREATE TABLE "property_operators" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id"        UUID NOT NULL,
    "profile_id"         UUID,
    "organization_id"    UUID,
    "mandate_reference"  TEXT,
    "starts_at"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at"            TIMESTAMPTZ(3),
    "created_at"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "property_operators_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "property_operators"
  ADD CONSTRAINT "property_operators_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "property_operators_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "property_operators_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "property_operators_holder_check"
    CHECK (
      ("profile_id" IS NOT NULL AND "organization_id" IS NULL)
      OR ("profile_id" IS NULL AND "organization_id" IS NOT NULL)
    ),
  ADD CONSTRAINT "property_operators_ends_after_starts_check"
    CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");

CREATE INDEX "property_operators_property_id_idx" ON "property_operators" ("property_id");
CREATE INDEX "property_operators_organization_id_idx" ON "property_operators" ("organization_id");

-- Who receives revenue in the future financial phases must never be
-- ambiguous: at most one CURRENT (ends_at IS NULL) operator per property.
-- A partial unique index, not a CHECK (which cannot see other rows) and not
-- a trigger (a unique index is the cheaper, declarative equivalent here) —
-- Prisma has no schema syntax for a partial index, so this does not appear
-- in prisma/schema.prisma; same pattern as the booking EXCLUDE constraint
-- documented above `model Booking`.
CREATE UNIQUE INDEX "property_operators_one_current_idx"
  ON "property_operators" ("property_id")
  WHERE "ends_at" IS NULL;

ALTER TABLE "property_operators" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.property_operators FROM %I', v_role);
    END IF;
  END LOOP;
END $$;

CREATE TABLE "property_managers" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id"        UUID NOT NULL,
    "profile_id"         UUID,
    "organization_id"    UUID,
    -- Reserved for a future per-property permission model. Nothing reads it
    -- yet — see the model doc comment in prisma/schema.prisma.
    "scope"              JSONB,
    "starts_at"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at"            TIMESTAMPTZ(3),
    "created_at"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "property_managers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "property_managers"
  ADD CONSTRAINT "property_managers_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "property_managers_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "property_managers_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "property_managers_holder_check"
    CHECK (
      ("profile_id" IS NOT NULL AND "organization_id" IS NULL)
      OR ("profile_id" IS NULL AND "organization_id" IS NOT NULL)
    ),
  ADD CONSTRAINT "property_managers_ends_after_starts_check"
    CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");

CREATE INDEX "property_managers_property_id_idx" ON "property_managers" ("property_id");
CREATE INDEX "property_managers_organization_id_idx" ON "property_managers" ("organization_id");

ALTER TABLE "property_managers" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.property_managers FROM %I', v_role);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. spaces.property_id — added nullable, backfilled below, then required
-- ---------------------------------------------------------------------------
ALTER TABLE "spaces" ADD COLUMN "property_id" UUID;

-- ---------------------------------------------------------------------------
-- 5. Backfill — every existing space keeps working, and gets a Property
--
-- Grouped by (organization_id, address, city, postal_code): spaces that
-- already share an exact address become units of the same backfilled
-- Property; anything else — including a typo'd address — gets its own
-- rather than being guessed into someone else's building. Over-splitting is
-- the safe failure mode here, under-splitting is not.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE "_property_backfill" AS
SELECT
  "organization_id",
  "address",
  "city",
  "postal_code",
  gen_random_uuid() AS "property_id",
  min("created_at") AS "earliest_created_at"
FROM "spaces"
GROUP BY "organization_id", "address", "city", "postal_code";

-- created_by_profile_id: the organization's longest-standing ACTIVE OWNER,
-- falling back to any ACTIVE member. If an organization somehow has neither
-- (violates the "every organization has an active owner" invariant the
-- service layer maintains — src/server/domains/organizations/membership.ts)
-- this INSERT fails on the NOT NULL column rather than inventing a creator,
-- which is the wanted behaviour: surface the bad data, do not hide it.
INSERT INTO "properties" (
  "id", "label", "property_type", "status",
  "address_line1", "postal_code", "city", "country",
  "created_by_profile_id", "created_at", "updated_at"
)
SELECT
  b."property_id",
  b."address",
  'OTHER'::"PropertyType",
  'ACTIVE'::"PropertyStatus",
  b."address",
  b."postal_code",
  b."city",
  'FR',
  COALESCE(
    (SELECT om."profile_id" FROM "organization_members" om
      WHERE om."organization_id" = b."organization_id"
        AND om."org_role" = 'OWNER' AND om."status" = 'ACTIVE'
      ORDER BY om."joined_at" ASC LIMIT 1),
    (SELECT om2."profile_id" FROM "organization_members" om2
      WHERE om2."organization_id" = b."organization_id" AND om2."status" = 'ACTIVE'
      ORDER BY om2."joined_at" ASC LIMIT 1)
  ),
  b."earliest_created_at",
  now()
FROM "_property_backfill" b;

-- The organization that used to be the space's only authority becomes both
-- its owner and its operator — exactly what it already was in practice.
INSERT INTO "property_owners" (
  "id", "property_id", "organization_id", "ownership_share_basis_points",
  "starts_at", "created_at", "updated_at"
)
SELECT gen_random_uuid(), b."property_id", b."organization_id", 10000,
       b."earliest_created_at", b."earliest_created_at", now()
FROM "_property_backfill" b;

INSERT INTO "property_operators" (
  "id", "property_id", "organization_id", "starts_at", "created_at", "updated_at"
)
SELECT gen_random_uuid(), b."property_id", b."organization_id",
       b."earliest_created_at", b."earliest_created_at", now()
FROM "_property_backfill" b;

UPDATE "spaces" s
SET "property_id" = b."property_id"
FROM "_property_backfill" b
WHERE s."organization_id" = b."organization_id"
  AND s."address" = b."address"
  AND s."city" = b."city"
  AND s."postal_code" = b."postal_code";

DROP TABLE "_property_backfill";

-- Every row now has a property_id (or the migration already failed above).
ALTER TABLE "spaces" ALTER COLUMN "property_id" SET NOT NULL;

ALTER TABLE "spaces"
  ADD CONSTRAINT "spaces_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "spaces_property_id_idx" ON "spaces" ("property_id");
