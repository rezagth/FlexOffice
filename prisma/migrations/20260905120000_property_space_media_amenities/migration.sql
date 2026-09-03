-- Phase 5 — property/space management: photos, amenities, multi-slot hours.
--
-- WHAT THIS ADDS
--   property_photos / space_photos   real relational photo models, replacing
--                                     `spaces.photos text[]` for new uploads.
--   spaces.amenities (SpaceAmenity[]) a controlled vocabulary, replacing the
--                                     free-text `amenities text[]` for new
--                                     writes (renamed to `amenities_legacy`).
--   space_opening_hours               the `[space_id, weekday]` uniqueness
--                                     is dropped — a weekday may now have
--                                     several slots (morning/afternoon).
--   properties.description            free text, not yet shown anywhere
--                                     public.
--
-- WHAT IS DELIBERATELY *NOT* HERE
--   * `spaces.photos` is NOT dropped and NOT written to by new code — the
--     public space page and search card still read it (see the Phase 5
--     report, DETTE TECHNIQUE: wiring them to `space_photos` is Phase 6
--     work, alongside Listing). Existing URLs are backfilled into
--     `space_photos` below so the landlord-facing UI already shows them.
--   * `spaces.amenities_legacy` is NOT dropped — some existing free-text
--     values (e.g. "Caméra", "Paperboard" in the demo seed) have no mapping
--     onto `SpaceAmenity` and would otherwise be silently lost.
--   * Overlap between two opening-hour slots on the same weekday is a
--     cross-row check a CHECK cannot express — enforced in
--     `src/lib/validation/spaces.ts` and `opening-hours.ts`, with a test,
--     the same documented trade-off as every other cross-row invariant in
--     this codebase.
--
-- RISK / ROLLBACK
-- Additive except for the `amenities` column, which changes type (widened:
-- text[] -> a new enum array, with the original values preserved under
-- `amenities_legacy`, so no data is destroyed) and the opening-hours unique
-- constraint, which is dropped (a pure widening — every row that satisfied
-- it still does). Rollback: drop `property_photos`/`space_photos`, drop
-- `properties.description`, rename `amenities_legacy` back to `amenities`
-- after dropping the enum `amenities` column, restore the opening-hours
-- unique constraint (only safe if no space has gained a second same-day
-- slot since).

-- ---------------------------------------------------------------------------
-- 1. properties.description
-- ---------------------------------------------------------------------------
ALTER TABLE "properties" ADD COLUMN "description" TEXT;

-- ---------------------------------------------------------------------------
-- 2. Photos — property_photos / space_photos
-- ---------------------------------------------------------------------------
CREATE TABLE "property_photos" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id"  UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type"    TEXT NOT NULL,
    "size_bytes"   INTEGER,
    "width"        INTEGER,
    "height"       INTEGER,
    "position"     INTEGER NOT NULL DEFAULT 0,
    "is_primary"   BOOLEAN NOT NULL DEFAULT false,
    "alt_text"     TEXT,
    "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_photos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "property_photos"
  ADD CONSTRAINT "property_photos_storage_path_key" UNIQUE ("storage_path"),
  ADD CONSTRAINT "property_photos_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "property_photos_property_id_idx" ON "property_photos" ("property_id");

-- At most one PRIMARY photo per property — see the doc comment on
-- `model PropertyPhoto` in prisma/schema.prisma. Partial index, so it does
-- not appear as a schema-level `@@unique`.
CREATE UNIQUE INDEX "property_photos_one_primary_idx"
  ON "property_photos" ("property_id")
  WHERE "is_primary";

ALTER TABLE "property_photos" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.property_photos FROM %I', v_role);
    END IF;
  END LOOP;
END $$;

CREATE TABLE "space_photos" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "space_id"     UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type"    TEXT NOT NULL,
    "size_bytes"   INTEGER,
    "width"        INTEGER,
    "height"       INTEGER,
    "position"     INTEGER NOT NULL DEFAULT 0,
    "is_primary"   BOOLEAN NOT NULL DEFAULT false,
    "alt_text"     TEXT,
    "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_photos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "space_photos"
  ADD CONSTRAINT "space_photos_storage_path_key" UNIQUE ("storage_path"),
  ADD CONSTRAINT "space_photos_space_id_fkey"
    FOREIGN KEY ("space_id") REFERENCES "spaces" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "space_photos_space_id_idx" ON "space_photos" ("space_id");

CREATE UNIQUE INDEX "space_photos_one_primary_idx"
  ON "space_photos" ("space_id")
  WHERE "is_primary";

ALTER TABLE "space_photos" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.space_photos FROM %I', v_role);
    END IF;
  END LOOP;
END $$;

-- Backfill: every existing `spaces.photos` URL becomes a SpacePhoto row, so
-- the new landlord-facing photo UI shows what was already there. Best
-- effort — a URL that does not carry the "/space-photos/" marker (should
-- not happen; every existing photo was uploaded through addSpacePhoto(),
-- which always builds one) is skipped rather than guessed at.
--
-- mime_type is guessed from the file extension in the path (the only
-- record of it a legacy row carries); size_bytes is left NULL (genuinely
-- unknown) rather than a fabricated value.
INSERT INTO "space_photos" ("id", "space_id", "storage_path", "mime_type", "position", "is_primary", "created_at")
SELECT
  gen_random_uuid(),
  s."id",
  split_part(url, '/space-photos/', 2),
  CASE
    WHEN url ~* '\.png($|\?)' THEN 'image/png'
    WHEN url ~* '\.webp($|\?)' THEN 'image/webp'
    ELSE 'image/jpeg'
  END,
  ord - 1,
  ord = 1,
  s."created_at"
FROM "spaces" s
CROSS JOIN LATERAL unnest(s."photos") WITH ORDINALITY AS t(url, ord)
WHERE url LIKE '%/space-photos/%';

-- ---------------------------------------------------------------------------
-- 3. Amenities — controlled vocabulary
-- ---------------------------------------------------------------------------
CREATE TYPE "SpaceAmenity" AS ENUM (
  'WIFI', 'PARKING', 'PROJECTOR', 'SCREEN', 'PRINTER', 'KITCHEN',
  'AIR_CONDITIONING', 'WHEELCHAIR_ACCESS', 'COFFEE', 'PHONE_BOOTH',
  'WHITEBOARD', 'OTHER'
);

ALTER TABLE "spaces" RENAME COLUMN "amenities" TO "amenities_legacy";
ALTER TABLE "spaces" ALTER COLUMN "amenities_legacy" SET DEFAULT '{}';

ALTER TABLE "spaces" ADD COLUMN "amenities" "SpaceAmenity"[] NOT NULL DEFAULT '{}';

-- Best-effort mapping from the free text this project's own seed/UI have
-- used so far (French labels, see src/lib/format.ts). Anything unmapped —
-- there is no "Caméra" or "Paperboard" entry in SpaceAmenity — is simply
-- absent from the new column; it survives in amenities_legacy, nothing is
-- deleted.
UPDATE "spaces" s
SET "amenities" = COALESCE((
  SELECT array_agg(DISTINCT mapped.value::"SpaceAmenity")
  FROM unnest(s."amenities_legacy") AS raw(label)
  JOIN (VALUES
    ('wifi', 'WIFI'),
    ('parking', 'PARKING'),
    ('écran', 'SCREEN'),
    ('ecran', 'SCREEN'),
    ('vidéoprojecteur', 'PROJECTOR'),
    ('videoprojecteur', 'PROJECTOR'),
    ('projecteur', 'PROJECTOR'),
    ('imprimante', 'PRINTER'),
    ('tableau blanc', 'WHITEBOARD'),
    ('climatisation', 'AIR_CONDITIONING'),
    ('café', 'COFFEE'),
    ('cafe', 'COFFEE'),
    ('cabine téléphonique', 'PHONE_BOOTH'),
    ('cabine telephonique', 'PHONE_BOOTH'),
    ('accès pmr', 'WHEELCHAIR_ACCESS'),
    ('acces pmr', 'WHEELCHAIR_ACCESS'),
    ('cuisine', 'KITCHEN')
  ) AS mapped(raw_lower, value) ON lower(trim(raw.label)) = mapped.raw_lower
), '{}');

-- ---------------------------------------------------------------------------
-- 4. Multiple opening-hour slots per weekday
-- ---------------------------------------------------------------------------
DROP INDEX "space_opening_hours_space_id_weekday_key";
CREATE INDEX "space_opening_hours_space_id_weekday_idx"
  ON "space_opening_hours" ("space_id", "weekday");
