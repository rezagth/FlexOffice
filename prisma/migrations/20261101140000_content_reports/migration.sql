-- Legal: notice mechanism for illegal / unauthorized / inaccurate listings.
-- New table under RLS with anon/authenticated revoked, like every table here:
-- only the server (Prisma) reads or writes it.

CREATE TYPE "ContentReportReason" AS ENUM ('ILLEGAL', 'NOT_AUTHORIZED', 'INACCURATE', 'DISCRIMINATORY', 'OTHER');
CREATE TYPE "ContentReportStatus" AS ENUM ('PENDING', 'DISMISSED', 'ACTIONED');

CREATE TABLE "content_reports" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "space_id"              UUID NOT NULL REFERENCES "spaces"("id") ON DELETE CASCADE,
  "reason"                "ContentReportReason" NOT NULL,
  "message"               TEXT NOT NULL,
  "reporter_email"        TEXT,
  "reporter_profile_id"   UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "status"                "ContentReportStatus" NOT NULL DEFAULT 'PENDING',
  "handled_at"            TIMESTAMPTZ(3),
  "handled_by_profile_id" UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "resolution"            TEXT,
  "created_at"            TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX "content_reports_status_created_at_idx" ON "content_reports" ("status", "created_at");
CREATE INDEX "content_reports_space_id_idx" ON "content_reports" ("space_id");

ALTER TABLE "content_reports" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "content_reports" FROM anon, authenticated;
