-- Reviews (point 8 of the V1 analysis, 07/10/2026).
--
-- One review per booking, written by the client who made it, once the
-- booking is over (rule enforced in src/server/domains/reviews/reviews.ts:
-- COMPLETED, or CONFIRMED and ended, within REVIEW_WINDOW_DAYS). The
-- landlord can answer once; a platform administrator can hide a review
-- (never delete it: the hide is traced, the text kept for disputes).
--
-- organization_id is the landlord organization of the booking, copied for
-- scoping the landlord's list and the reply; the composite foreign key below
-- makes a review pointing at another organization than its booking's
-- unrepresentable (same pattern as payments, migration 20260903110100).

CREATE TABLE "space_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "author_profile_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "landlord_reply" TEXT,
    "landlord_replied_at" TIMESTAMPTZ(3),
    "hidden_at" TIMESTAMPTZ(3),
    "hidden_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "space_reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    CONSTRAINT "space_reviews_comment_length_check"
      CHECK ("comment" IS NULL OR length("comment") <= 2000),
    CONSTRAINT "space_reviews_reply_length_check"
      CHECK ("landlord_reply" IS NULL OR (length(btrim("landlord_reply")) > 0 AND length("landlord_reply") <= 2000)),
    CONSTRAINT "space_reviews_reply_consistency_check"
      CHECK (("landlord_reply" IS NULL) = ("landlord_replied_at" IS NULL))
);

CREATE UNIQUE INDEX "space_reviews_booking_id_key" ON "space_reviews"("booking_id");
-- Redundant with the one above, required by Prisma for the composite
-- one-to-one relation to bookings.
CREATE UNIQUE INDEX "space_reviews_booking_id_organization_id_key" ON "space_reviews"("booking_id", "organization_id");
CREATE INDEX "space_reviews_space_id_created_at_idx" ON "space_reviews"("space_id", "created_at");
CREATE INDEX "space_reviews_organization_id_created_at_idx" ON "space_reviews"("organization_id", "created_at");

ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_booking_org_fkey"
  FOREIGN KEY ("booking_id", "organization_id") REFERENCES "bookings"("id", "organization_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_space_id_fkey"
  FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Profiles are anonymized, never deleted (GDPR erasure keeps a tombstone),
-- so RESTRICT is safe and keeps the "who wrote it" link for disputes.
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_author_profile_id_fkey"
  FOREIGN KEY ("author_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "space_reviews" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.space_reviews FROM %I', v_role);
    END IF;
  END LOOP;
END $$;

-- The "leave a review" e-mail is sent at most once per booking: the row is
-- claimed by setting this column before the e-mail goes out (same pattern
-- as reminder_sent_at).
ALTER TABLE "bookings" ADD COLUMN "review_invited_at" TIMESTAMPTZ(3);
