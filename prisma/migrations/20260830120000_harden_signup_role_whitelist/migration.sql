-- Security fix S-01 — privilege escalation at signup.
--
-- The previous version of `handle_new_user` (migration
-- 20260101000100_auth_profiles_sync) took the profile role straight from
-- `raw_user_meta_data ->> 'role'`. That column is the `options.data` payload
-- of `supabase.auth.signUp()`: fully client-controlled, and reachable without
-- going through this app at all —
--
--   POST https://<project>.supabase.co/auth/v1/signup
--   apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY, readable in the JS bundle>
--   { "email": "...", "password": "...", "data": { "role": "ADMIN" } }
--
-- The Zod discriminated union in src/lib/validation/auth.ts only guards
-- POST /api/auth/register, so it never saw that request. Anyone could mint
-- themselves an ADMIN profile in one call.
--
-- This migration replaces the function with one that treats
-- `raw_user_meta_data` as hostile input:
--   * role is whitelisted to CLIENT | PARTNER — anything else (ADMIN,
--     garbage, empty) silently falls back to CLIENT;
--   * the PARTNER organization fields are validated here, mirroring the Zod
--     schema, because the direct Supabase path bypasses Zod entirely.
--
-- ADMIN profiles are created only by the service role (prisma/seed.ts) or by
-- a future route guarded by requireRole("ADMIN"). Never by a signup.
--
-- Idempotent: CREATE OR REPLACE on the function, the trigger from
-- 20260101000100 keeps pointing at it. No data migration, no lock beyond the
-- function definition — safe to run on a live database.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role             text := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'role', ''), 'CLIENT');
  v_name             text := COALESCE(btrim(NEW.raw_user_meta_data ->> 'name'), '');
  v_phone            text := NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone'), '');
  v_org_name         text;
  v_org_siret        text;
  v_org_email        text;
  v_org_address      text;
  v_org_city         text;
  v_org_postal_code  text;
  v_org_id           uuid;
BEGIN
  -- S-01: role is client-supplied. Whitelist it; never RAISE here, so that a
  -- probe for 'ADMIN' is indistinguishable from an ordinary CLIENT signup.
  IF v_role NOT IN ('CLIENT', 'PARTNER') THEN
    v_role := 'CLIENT';
  END IF;

  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'name must be at most 120 characters';
  END IF;

  IF v_phone IS NOT NULL AND length(v_phone) > 30 THEN
    RAISE EXCEPTION 'phone must be at most 30 characters';
  END IF;

  IF v_role = 'PARTNER' THEN
    -- Mirrors partnerRegisterSchema in src/lib/validation/auth.ts. Kept in
    -- the trigger too: a direct /auth/v1/signup call never reaches Zod.
    v_org_name        := NULLIF(btrim(NEW.raw_user_meta_data ->> 'organization_name'), '');
    v_org_siret       := NULLIF(btrim(NEW.raw_user_meta_data ->> 'organization_siret'), '');
    v_org_email       := COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'organization_email'), ''), NEW.email);
    v_org_address     := NULLIF(btrim(NEW.raw_user_meta_data ->> 'organization_address'), '');
    v_org_city        := NULLIF(btrim(NEW.raw_user_meta_data ->> 'organization_city'), '');
    v_org_postal_code := NULLIF(btrim(NEW.raw_user_meta_data ->> 'organization_postal_code'), '');

    IF v_org_name IS NULL OR length(v_org_name) > 200 THEN
      RAISE EXCEPTION 'organization_name is required and must be at most 200 characters';
    END IF;

    IF v_org_siret IS NULL OR v_org_siret !~ '^[0-9]{14}$' THEN
      RAISE EXCEPTION 'organization_siret must be exactly 14 digits';
    END IF;

    IF length(v_org_email) > 255 OR v_org_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'organization_email must be a valid email of at most 255 characters';
    END IF;

    IF v_org_address IS NULL OR length(v_org_address) > 255 THEN
      RAISE EXCEPTION 'organization_address is required and must be at most 255 characters';
    END IF;

    IF v_org_city IS NULL OR length(v_org_city) > 120 THEN
      RAISE EXCEPTION 'organization_city is required and must be at most 120 characters';
    END IF;

    IF v_org_postal_code !~ '^[0-9]{5}$' THEN
      RAISE EXCEPTION 'organization_postal_code must be exactly 5 digits';
    END IF;

    -- updated_at is populated by Prisma Client at query time for
    -- Prisma-issued writes (no DB-level default) — since this insert
    -- bypasses Prisma entirely, it must be set explicitly here.
    INSERT INTO public.organizations
      (id, name, siret, email, address, city, postal_code, updated_at)
    VALUES (
      gen_random_uuid(),
      v_org_name,
      v_org_siret,
      v_org_email,
      v_org_address,
      v_org_city,
      v_org_postal_code,
      now()
    )
    RETURNING id INTO v_org_id;
  END IF;

  INSERT INTO public.profiles (id, email, name, phone, role, organization_id, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    v_name,
    v_phone,
    v_role::"Role",
    v_org_id,
    now()
  );

  RETURN NEW;
END;
$$;
