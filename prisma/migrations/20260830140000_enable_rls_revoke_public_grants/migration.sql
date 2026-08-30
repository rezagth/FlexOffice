-- S-02: make "the browser cannot reach these tables" a property of this
-- schema, not of a hosting provider's default.
--
-- Supabase exposes the whole `public` schema through PostgREST, and grants
-- `anon`/`authenticated` full DML on it. Those two roles are reachable with
-- the publishable key, which ships inside the browser bundle — so without
-- this migration, `DELETE FROM bookings` is a request anyone can send.
--
-- Two independent locks, on purpose:
--   1. REVOKE — the roles have no privilege to exercise in the first place.
--   2. ENABLE ROW LEVEL SECURITY with no policy — even if a grant is ever
--      restored by hand or by a provider default, every row stays invisible.
--
-- The application is unaffected: it reaches Postgres through Prisma as the
-- owner role (BYPASSRLS), never through PostgREST. `handle_new_user` is
-- SECURITY DEFINER and runs as its owner, so signup still writes profiles.
--
-- A new table added later is NOT covered automatically. Every migration
-- that creates a table must repeat this block for it — see
-- tests/unit/rls-coverage.test.ts, which fails when one doesn't.

-- 1. Remove PostgREST-reachable privileges, now and for future tables.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 2. Deny-by-default at the row level on every existing table.
ALTER TABLE "profiles"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "spaces"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "space_opening_hours"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "space_closures"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookings"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refunds"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "disputes"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispute_events"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "favorites"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs"           ENABLE ROW LEVEL SECURITY;
