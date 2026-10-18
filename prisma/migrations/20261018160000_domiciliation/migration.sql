-- PRD V1.1, lot 2B, commit 2 — domiciliation (R53-R58, S11).
--
-- Additive. The singleton settings row is inserted with its column
-- DEFAULT (false) — this migration never sets the MakomSpace offer to
-- enabled; only a later admin action does, after legal sign-off this
-- codebase cannot verify.

ALTER TYPE "NotificationType" ADD VALUE 'DOMICILIATION_STATUS_CHANGED';

CREATE TYPE "DomiciliationKind" AS ENUM ('MAKOMSPACE', 'THIRD_PARTY');
CREATE TYPE "DomiciliationStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'ACCEPTED', 'REFUSED');

CREATE TABLE "domiciliation_requests" (
  "id"                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"               UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "kind"                          "DomiciliationKind" NOT NULL,
  "status"                        "DomiciliationStatus" NOT NULL,
  "domiciliataire_name"           TEXT,
  "address"                       TEXT,
  "city"                          TEXT,
  "postal_code"                   TEXT,
  "attestation_storage_path"      TEXT,
  "attestation_original_filename" TEXT,
  "attestation_mime_type"         TEXT,
  "attestation_size_bytes"        INTEGER,
  "admin_notes"                   TEXT,
  "requested_by_profile_id"       UUID NOT NULL REFERENCES "profiles"("id"),
  "reviewed_by_profile_id"        UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "reviewed_at"                   TIMESTAMPTZ(3),
  "created_at"                    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"                    TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX "domiciliation_requests_organization_id_created_at_idx"
  ON "domiciliation_requests" ("organization_id", "created_at");
CREATE INDEX "domiciliation_requests_status_idx" ON "domiciliation_requests" ("status");

ALTER TABLE "domiciliation_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "domiciliation_requests" FROM anon, authenticated;

-- Singleton (see DomiciliationSettings's own doc comment in schema.prisma):
-- "id" is always 1, enforced below so a second row can never exist.
CREATE TABLE "domiciliation_settings" (
  "id"                     INTEGER PRIMARY KEY DEFAULT 1,
  "offer_enabled"          BOOLEAN NOT NULL DEFAULT false,
  "updated_at"             TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_by_profile_id"  UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  CONSTRAINT "domiciliation_settings_singleton_check" CHECK ("id" = 1)
);

ALTER TABLE "domiciliation_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "domiciliation_settings" FROM anon, authenticated;

INSERT INTO "domiciliation_settings" ("id") VALUES (1);
