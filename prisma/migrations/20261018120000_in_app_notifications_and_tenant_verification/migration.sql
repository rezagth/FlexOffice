-- PRD V1.1, lot 2A, commit 1.
--
-- 1) In-app notification center (R67-R69) — one flat table, no per-type
--    sub-schema: the caller renders the final French title/body once at
--    creation time (see src/server/domains/notifications/in-app.ts), which
--    is also what keeps a phone number or a SIRET from ever landing in a
--    notification's text (R69) — there is no later re-render step that
--    could pull one in.
--
-- 2) LandlordVerification.activity_type becomes nullable (R71-R74): a
--    dossier opened to verify a company that only rents spaces has no
--    "owns vs. operates the property" answer to give, since it is not
--    providing a property at all. Every landlord dossier keeps setting it,
--    same as before — lib/validation/landlord.ts still requires it on that
--    path. Additive and backward-compatible: no existing row is null today,
--    none is touched by this migration.

CREATE TYPE "NotificationType" AS ENUM (
  'BOOKING_CONFIRMED',
  'BOOKING_REJECTED',
  'BOOKING_EXPIRED',
  'VERIFICATION_APPROVED',
  'VERIFICATION_REJECTED'
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_profile_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_recipient_profile_id_read_at_idx" ON "notifications"("recipient_profile_id", "read_at");
CREATE INDEX "notifications_recipient_profile_id_created_at_idx" ON "notifications"("recipient_profile_id", "created_at");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_profile_id_fkey"
  FOREIGN KEY ("recipient_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.notifications FROM %I', v_role);
    END IF;
  END LOOP;
END $$;

ALTER TABLE "landlord_verifications" ALTER COLUMN "activity_type" DROP NOT NULL;
