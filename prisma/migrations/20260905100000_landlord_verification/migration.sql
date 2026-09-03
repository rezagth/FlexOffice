-- Phase 3 — landlord onboarding verification.
--
-- WHAT THIS ADDS, CONCEPTUALLY
-- "Devenir bailleur" (Phase 2) unlocks the landlord CAPABILITY and creates the
-- Organization that will hold the activity. It does not establish WHY that
-- organization is entitled to let a space — that a person owns it, or has the
-- right to sublet it. This migration adds the dossier that captures that:
--
--   landlord_verifications   one dossier per organization's landlord
--                            activity: who requested it, for what reason
--                            (OWNER vs OPERATOR), its review lifecycle, who
--                            reviewed it and why it was rejected.
--   verification_documents   the evidence attached to a dossier — never the
--                            file itself, only where it lives in Storage and
--                            enough metadata to review and retain it.
--
-- Property/PropertyOwner/PropertyOperator are NOT introduced here on purpose:
-- there is no per-property granularity yet, so a dossier is scoped to the
-- organization's activity as a whole. Phase 4 attaches this to individual
-- properties.
--
-- ACTIVITYTYPE VS ORGROLE
-- `LandlordActivityType` (OWNER | OPERATOR) is a different axis from
-- `OrgRole.OWNER` (Phase 2, membership inside an organization). The former
-- answers "why may this organization let a space" (owns it vs exploits it
-- under a sublet authorisation); the latter answers "what may this person do
-- inside the organization". Prisma scopes enum values to their own type, so
-- both enums can use OWNER without clashing.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "LandlordActivityType" AS ENUM ('OWNER', 'OPERATOR');

CREATE TYPE "VerificationStatus" AS ENUM (
  'DRAFT', 'PENDING_REVIEW', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED'
);

-- Kept open-ended on purpose ("Ne rends pas la liste trop rigide"): OTHER
-- exists so a document type the business did not anticipate can still be
-- filed today. The mapping from (holderType, activityType) to which types
-- are REQUIRED lives in application code
-- (src/server/domains/verification/requirements.ts), not in this enum or a
-- constraint — adding a new required document later is a code change, not a
-- migration.
CREATE TYPE "VerificationDocumentType" AS ENUM (
  'IDENTITY_DOCUMENT',
  'OWNERSHIP_PROOF',
  'K_BIS',
  'VAT_PROOF',
  'LEGAL_REPRESENTATIVE_ID',
  'SUBLEASE_AUTHORIZATION',
  'OTHER'
);

CREATE TYPE "VerificationDocumentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- ---------------------------------------------------------------------------
-- 2. landlord_verifications
-- ---------------------------------------------------------------------------
CREATE TABLE "landlord_verifications" (
    "id"                       UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id"          UUID NOT NULL,
    "requested_by_profile_id"  UUID NOT NULL,
    "activity_type"            "LandlordActivityType" NOT NULL,
    "status"                   "VerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at"             TIMESTAMPTZ(3),
    "review_started_at"        TIMESTAMPTZ(3),
    "reviewed_at"              TIMESTAMPTZ(3),
    "reviewed_by_profile_id"   UUID,
    "rejection_reason"         TEXT,
    "expires_at"               TIMESTAMPTZ(3),
    "created_at"               TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"               TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "landlord_verifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "landlord_verifications"
  ADD CONSTRAINT "landlord_verifications_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "landlord_verifications_requested_by_profile_id_fkey"
    FOREIGN KEY ("requested_by_profile_id") REFERENCES "profiles" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- SET NULL: the reviewer's own account may later be deleted or anonymized;
  -- the review decision itself must survive that.
  ADD CONSTRAINT "landlord_verifications_reviewed_by_profile_id_fkey"
    FOREIGN KEY ("reviewed_by_profile_id") REFERENCES "profiles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- A rejection without a reason is exactly the failure mode step 10 exists to
-- prevent: "conserver le motif" is not optional.
ALTER TABLE "landlord_verifications"
  ADD CONSTRAINT "landlord_verifications_rejection_reason_check"
  CHECK ("status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

CREATE INDEX "landlord_verifications_organization_id_idx"
  ON "landlord_verifications" ("organization_id");
CREATE INDEX "landlord_verifications_status_idx"
  ON "landlord_verifications" ("status");

-- ---------------------------------------------------------------------------
-- 3. verification_documents
-- ---------------------------------------------------------------------------
CREATE TABLE "verification_documents" (
    "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
    "verification_id"        UUID NOT NULL,
    "type"                   "VerificationDocumentType" NOT NULL,
    -- Internal, server-generated path — never derived from the filename the
    -- caller supplied. See domains/verification/storage.ts.
    "storage_path"           TEXT NOT NULL,
    -- Sanitized for DISPLAY only; never used to build a storage path or any
    -- other identifier.
    "original_filename"      TEXT NOT NULL,
    "mime_type"               TEXT NOT NULL,
    "size_bytes"              INTEGER NOT NULL,
    -- SHA-256 hex, computed server-side from the uploaded bytes. Nullable:
    -- present once computed, but a document row must exist before its
    -- checksum can be verified.
    "checksum"                 TEXT,
    "status"                    "VerificationDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "uploaded_by_profile_id"    UUID NOT NULL,
    "uploaded_at"                TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- RGPD: when set, the retention job (a later phase) purges the object
    -- and this row past this date. Null means "still an active dossier" —
    -- see the retention note in domains/verification/documents.ts.
    "retention_until"             TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_documents_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "verification_documents"
  ADD CONSTRAINT "verification_documents_verification_id_fkey"
    FOREIGN KEY ("verification_id") REFERENCES "landlord_verifications" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "verification_documents_uploaded_by_profile_id_fkey"
    FOREIGN KEY ("uploaded_by_profile_id") REFERENCES "profiles" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "verification_documents"
  ADD CONSTRAINT "verification_documents_storage_path_key" UNIQUE ("storage_path"),
  ADD CONSTRAINT "verification_documents_size_bytes_positive_check"
    CHECK ("size_bytes" > 0);

CREATE INDEX "verification_documents_verification_id_idx"
  ON "verification_documents" ("verification_id");

-- ---------------------------------------------------------------------------
-- 4. S-02 block, required for every new table — see
--    20260830140000_enable_rls_revoke_public_grants and
--    tests/unit/rls-coverage.test.ts, which fails if a new table skips it.
--    RLS with no policy denies every role subject to it; the application
--    reaches Postgres through Prisma as the table owner, exempt unless FORCE
--    is set (deliberately not set).
-- ---------------------------------------------------------------------------
ALTER TABLE "landlord_verifications"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification_documents"  ENABLE ROW LEVEL SECURITY;

-- Guarded: the roles exist on Supabase but not on a bare PostgreSQL, where an
-- unguarded REVOKE raises `role "anon" does not exist` and fails the deploy.
DO $$
DECLARE
  v_role text;
  v_table text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      FOREACH v_table IN ARRAY ARRAY['landlord_verifications', 'verification_documents'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', v_table, v_role);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Backfill — every organization already exercising a landlord activity
--    (created by Phase 2's "Devenir bailleur", or by the Phase 2 backfill of
--    a legacy PARTNER account) gets a dossier, so no landlord is left with
--    isLandlord = true and nothing to show on /app/landlord/verification.
--
--    No documents exist for these — none were ever collected before this
--    migration — so a dossier is not fabricated as APPROVED for an
--    organization that has not actually proven anything. The one exception
--    is an organization already VERIFIED (Phase 1's `seed.ts` promotes the
--    demo partners this way, and a real deployment may have promoted one by
--    hand before this migration existed): its dossier is backfilled as
--    APPROVED, reviewed_at set to its own updated_at, reviewed_by left NULL
--    to record honestly that no admin actually reviewed it through this
--    workflow. Every other organization gets a DRAFT dossier, so its owner
--    is prompted to complete it rather than silently blocked or silently
--    passed.
--
--    activity_type defaults to OWNER — the only assumption available for
--    data that predates this concept — and is corrected the next time the
--    account visits the verification page, which is out of scope for a
--    migration to detect on its own.
-- ---------------------------------------------------------------------------
INSERT INTO "landlord_verifications"
  ("organization_id", "requested_by_profile_id", "activity_type", "status",
   "reviewed_at", "created_at", "updated_at")
SELECT
  o."id",
  m."profile_id",
  'OWNER'::"LandlordActivityType",
  CASE WHEN o."status" = 'VERIFIED' THEN 'APPROVED' ELSE 'DRAFT' END::"VerificationStatus",
  CASE WHEN o."status" = 'VERIFIED' THEN o."updated_at" ELSE NULL END,
  o."created_at",
  now()
FROM "organizations" o
JOIN LATERAL (
  SELECT om."profile_id"
  FROM "organization_members" om
  WHERE om."organization_id" = o."id" AND om."org_role" = 'OWNER' AND om."status" = 'ACTIVE'
  ORDER BY om."joined_at" ASC
  LIMIT 1
) m ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "landlord_verifications" lv WHERE lv."organization_id" = o."id"
);
