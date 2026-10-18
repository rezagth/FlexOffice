-- PRD V1.1, lot 2B, commit 1 — phone verification by SMS code (R25-R30,
-- R47, R51).
--
-- Additive: no existing row is touched. `phone_verified_at` is NULL for
-- every profile today, same as it will be for any profile whose phone is
-- filled but not yet proven reachable.

ALTER TABLE "profiles" ADD COLUMN "phone_verified_at" TIMESTAMPTZ(3);

-- A phone number already verified by one profile can never be claimed as
-- verified by a second one — a verified number is a trust signal, and two
-- accounts both "owning" it defeats that. Partial (not a plain UNIQUE):
-- unverified numbers collide freely, which already happens today and is
-- not this migration's concern. Not expressible in Prisma's schema DSL,
-- same reasoning as `bookings_no_overlap_excl` — enforced here only.
CREATE UNIQUE INDEX "profiles_verified_phone_unique"
  ON "profiles" ("phone")
  WHERE "phone_verified_at" IS NOT NULL;

ALTER TYPE "NotificationType" ADD VALUE 'PHONE_VERIFIED';

CREATE TYPE "PhoneVerificationPurpose" AS ENUM ('INITIAL_VERIFICATION', 'NUMBER_CHANGE');

CREATE TABLE "phone_verification_codes" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id"       UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "purpose"          "PhoneVerificationPurpose" NOT NULL,
  "phone"            TEXT NOT NULL,
  "pending_new_phone" TEXT,
  "code_hash"        TEXT NOT NULL,
  "expires_at"       TIMESTAMPTZ(3) NOT NULL,
  "attempts"         INTEGER NOT NULL DEFAULT 0,
  "consumed_at"      TIMESTAMPTZ(3),
  "created_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX "phone_verification_codes_profile_id_consumed_at_idx"
  ON "phone_verification_codes" ("profile_id", "consumed_at");

ALTER TABLE "phone_verification_codes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "phone_verification_codes" FROM anon, authenticated;
