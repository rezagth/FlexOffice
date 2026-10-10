-- Lot A — accounts, terms acceptance, GDPR retention.
--
-- 1. B-11 — nobody accepted the CGU/CGV/privacy policy and nothing was
--    timestamped. Acceptance is now recorded server-side, with the version
--    of the documents that was shown:
--      * profiles.terms_accepted_at / terms_version — written by the
--        register domain (src/server/domains/users/register.ts) after a
--        successful signUp, NEVER from raw_user_meta_data (client-controlled
--        and reachable through /auth/v1/signup without this app).
--      * bookings.cgv_accepted_at / cgv_version — written by create-booking
--        when the client ticks "J'accepte les CGV".
--    Nullable: rows created before this migration accepted nothing, and
--    pretending otherwise would forge evidence. The CHECKs keep the pair
--    consistent (a version without a date, or the reverse, is meaningless).
--
-- 2. FCT-18 — changing the e-mail address goes through Supabase
--    (`updateUser({ email })` + confirmation link), which updates
--    auth.users.email only. profiles.email (read by every page, used for
--    receipts and re-authentication) was never kept in step. The trigger
--    below copies the confirmed address. Anonymized profiles are skipped:
--    profiles_anonymized_has_no_pii_check pins their e-mail to a tombstone,
--    and the GDPR flow already writes the same tombstone to both sides.
--
-- 3. SEC-10 — retention: a KYC document whose object has been removed from
--    the private `verification-documents` bucket (erasure, or the 12-month
--    retention purge) keeps its row for the dossier's history, marked here.

ALTER TABLE "profiles"
  ADD COLUMN "terms_accepted_at" TIMESTAMPTZ(3),
  ADD COLUMN "terms_version" TEXT;

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_terms_acceptance_pair_check"
  CHECK (("terms_accepted_at" IS NULL) = ("terms_version" IS NULL));

ALTER TABLE "bookings"
  ADD COLUMN "cgv_accepted_at" TIMESTAMPTZ(3),
  ADD COLUMN "cgv_version" TEXT;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_cgv_acceptance_pair_check"
  CHECK (("cgv_accepted_at" IS NULL) = ("cgv_version" IS NULL));

ALTER TABLE "verification_documents"
  ADD COLUMN "purged_at" TIMESTAMPTZ(3);

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
       SET email = NEW.email,
           updated_at = now()
     WHERE id = NEW.id
       AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();
