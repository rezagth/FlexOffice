-- Phase 2 — make signup produce the new account model.
--
-- `handle_new_user` still wrote only the old shape: `role`, and an
-- `organization_id` on the profile. After the expand migration a new signup
-- would land with platform_role/is_landlord/active_mode at their column
-- defaults and — for a partner signup — an organization with no
-- `organization_members` row, i.e. an organization nobody is a member of.
-- Every landlord authorization reads that table, so the account would look
-- correct and grant nothing.
--
-- This replaces the function so a signup is complete and atomic in the new
-- model. `CREATE OR REPLACE` only: the trigger from 20260101000100 keeps
-- pointing at it, and the earlier migration files are untouched.
--
-- S-01 IS PRESERVED, AND STILL THE POINT
-- `raw_user_meta_data` is the `options.data` payload of
-- `supabase.auth.signUp()` — entirely client-controlled, and reachable
-- without this application at all:
--
--   POST https://<project>.supabase.co/auth/v1/signup
--   apikey: <publishable key, readable in the JS bundle>
--   { "email": "...", "password": "...", "data": { "role": "ADMIN" } }
--
-- So the role whitelist stays, and `platform_role` is hard-coded to 'USER'
-- rather than derived from anything the client sent. There is no signup path
-- to ADMIN, by construction: an administrator is promoted by the service
-- role (prisma/seed.ts) or by a route behind requireRole("ADMIN").
--
-- WHY A PARTNER SIGNUP STILL LANDS IN TENANT MODE
-- The product rule is that every account starts as a tenant, even one that
-- already holds the landlord capability. `is_landlord` is set to true so the
-- mode is available immediately, and `active_mode` stays TENANT so the first
-- screen is the same for everyone. (The backfill of pre-existing partners in
-- 20260904100000 is the deliberate exception: those accounts were already
-- doing landlord work, and moving them to the tenant space would have been a
-- regression rather than a migration.)
--
-- IDEMPOTENT, and safe on a live database: no data migration, no lock beyond
-- the function definition.

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
  v_is_landlord      boolean := false;
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

    -- A partner signup always supplies a SIRET, so the holder is a COMPANY.
    -- An INDIVIDUAL landlord comes through "Devenir bailleur" instead.
    --
    -- updated_at is populated by Prisma Client at query time for
    -- Prisma-issued writes (no DB-level default) — since this insert
    -- bypasses Prisma entirely, it must be set explicitly here.
    INSERT INTO public.organizations
      (id, name, legal_name, siret, holder_type, email, address, city, postal_code, updated_at)
    VALUES (
      gen_random_uuid(),
      v_org_name,
      v_org_name,
      v_org_siret,
      'COMPANY',
      v_org_email,
      v_org_address,
      v_org_city,
      v_org_postal_code,
      now()
    )
    RETURNING id INTO v_org_id;

    v_is_landlord := true;
  END IF;

  INSERT INTO public.profiles (
    id, email, name, phone, role, organization_id, updated_at,
    platform_role, is_landlord, active_mode, active_organization_id
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_name,
    v_phone,
    v_role::"Role",
    v_org_id,
    now(),
    -- Never derived from the request: there is no signup path to ADMIN.
    'USER',
    v_is_landlord,
    -- Every account starts as a tenant, landlord capability or not.
    'TENANT',
    v_org_id
  );

  -- The membership is what actually grants landlord access. Without this row
  -- the organization created above would have no members and every
  -- authorization check would — correctly — refuse.
  IF v_org_id IS NOT NULL THEN
    INSERT INTO public.organization_members
      (organization_id, profile_id, org_role, status, joined_at, updated_at)
    VALUES (v_org_id, NEW.id, 'OWNER', 'ACTIVE', now(), now());
  END IF;

  RETURN NEW;
END;
$$;
