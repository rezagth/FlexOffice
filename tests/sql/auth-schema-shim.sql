-- Minimal stand-in for the parts of a Supabase project that this project's
-- migrations depend on. FOR CI AND LOCAL DOCKER ONLY.
--
-- WHY THIS FILE EXISTS
-- Two migrations cannot apply to a bare PostgreSQL instance:
--
--   1. `20260101000100_auth_profiles_sync` adds a real foreign key from
--      `public.profiles(id)` to `auth.users(id)` and a trigger on
--      `auth.users`. That schema belongs to Supabase.
--
--   2. `20260830140000_enable_rls_revoke_public_grants` revokes privileges
--      from the roles `anon` and `authenticated`. PostgreSQL raises
--      `role "anon" does not exist` when they are absent, so the migration —
--      and therefore the whole `prisma migrate deploy` — fails outright.
--
-- Creating both here lets the integration suite exercise the real
-- migrations, the real trigger and the real constraints against an ephemeral
-- database, with no Supabase project and no secrets.
--
-- It is applied BEFORE the migrations, and never against a Supabase database
-- (where all of this already exists).
--
-- It intentionally reproduces only what the migrations touch. It is NOT a
-- substitute for Supabase: no password hashing, no session handling, no
-- PostgREST. Tests that need those stay gated behind a real project — see
-- tests/integration/helpers/should-run.ts.

-- ---------------------------------------------------------------------------
-- 1. The `auth` schema and the one table the migrations reference.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text UNIQUE,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Supabase's PostgREST roles.
--
-- Created WITH the grants Supabase hands out by default — including the ones
-- that made S-02 exploitable (full DML on `public` reachable with the
-- publishable key). That is deliberate: a shim that starts from a locked-down
-- state would let the hardening migration pass while proving nothing. Here
-- the migration has something real to revoke, and
-- tests/integration/rls-live.test.ts can then assert that nothing is left.
--
-- NOLOGIN: these are privilege containers, never something to connect as.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
