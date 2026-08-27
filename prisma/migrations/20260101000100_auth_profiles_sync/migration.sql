-- Links public.profiles to Supabase's auth.users and keeps them in sync.
--
-- Prisma does not manage the `auth` schema (owned by Supabase), so this
-- migration is hand-written rather than generated. It must run AFTER the
-- baseline migration that creates `profiles` and `organizations`.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Real foreign key: a profile cannot outlive its Supabase auth user.
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_fkey"
  FOREIGN KEY ("id") REFERENCES auth.users(id) ON DELETE CASCADE;

-- Creates the `profiles` row (and, for PARTNER signups, the owning
-- `organizations` row) atomically whenever Supabase Auth inserts a new
-- auth.users row. Expected `raw_user_meta_data` (passed via
-- `supabase.auth.signUp({ options: { data: { ... } } })`):
--   role                     'CLIENT' | 'PARTNER'
--   name                     text
--   phone                    text, optional
--   organization_name        text, required when role = 'PARTNER'
--   organization_siret       text, required when role = 'PARTNER'
--   organization_email       text, optional (defaults to the user's email)
--   organization_address     text, required when role = 'PARTNER'
--   organization_city        text, required when role = 'PARTNER'
--   organization_postal_code text, required when role = 'PARTNER'
--
-- Missing required fields, or a duplicate SIRET, raise inside this trigger
-- and abort the whole auth.users insert — signUp() then fails atomically
-- instead of leaving an auth user with no profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := COALESCE(NEW.raw_user_meta_data ->> 'role', 'CLIENT');
  v_org_id uuid;
BEGIN
  IF v_role = 'PARTNER' THEN
    -- updated_at is populated by Prisma Client at query time for
    -- Prisma-issued writes (no DB-level default) — since this insert
    -- bypasses Prisma entirely, it must be set explicitly here.
    INSERT INTO public.organizations
      (id, name, siret, email, address, city, postal_code, updated_at)
    VALUES (
      gen_random_uuid(),
      NEW.raw_user_meta_data ->> 'organization_name',
      NEW.raw_user_meta_data ->> 'organization_siret',
      COALESCE(NEW.raw_user_meta_data ->> 'organization_email', NEW.email),
      NEW.raw_user_meta_data ->> 'organization_address',
      NEW.raw_user_meta_data ->> 'organization_city',
      NEW.raw_user_meta_data ->> 'organization_postal_code',
      now()
    )
    RETURNING id INTO v_org_id;
  END IF;

  INSERT INTO public.profiles (id, email, name, phone, role, organization_id, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    v_role::"Role",
    v_org_id,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
