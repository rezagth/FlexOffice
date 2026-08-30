-- GDPR account deletion marker. A profile with bookings cannot be
-- hard-deleted (bookings_client_user_id_fkey is ON DELETE RESTRICT), so
-- deletion requests for such accounts anonymize name/email/phone and set
-- this timestamp instead of removing the row.
ALTER TABLE "profiles" ADD COLUMN "deleted_at" TIMESTAMPTZ;
