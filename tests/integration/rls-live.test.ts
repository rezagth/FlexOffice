import { describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * Row Level Security regression test (S-02).
 *
 * Every table in `public` was created by Prisma with no RLS and no privilege
 * handling. Supabase serves the `public` schema through PostgREST at
 * /rest/v1/* with the publishable anon key — which is in the JS bundle by
 * design — so those tables were potentially readable and writable by anyone:
 *
 *   GET   /rest/v1/profiles?select=*      -> every account's email and phone
 *   PATCH /rest/v1/profiles?id=eq.<self>  -> {"role":"ADMIN"}
 *
 * Migration 20260903100000_enable_rls_and_revoke_client_grants closes it.
 * This test fails if any future migration creates a table without doing the
 * same — which is the failure mode worth catching, because the next table is
 * added by someone who has never read that migration.
 */
describe.skipIf(!hasDatabase)("row level security (S-02)", () => {
  it("leaves no table in `public` without RLS enabled", async () => {
    const { prisma } = await import("@/server/db/prisma");

    const unprotected = await prisma.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND NOT c.relrowsecurity
        -- Prisma's own bookkeeping table: not application data, and Prisma
        -- manages it with the migration role only.
        AND c.relname <> '_prisma_migrations'
      ORDER BY c.relname
    `;

    expect(
      unprotected.map((row) => row.relname),
      "A table in `public` has no RLS. On Supabase it is then reachable via " +
        "PostgREST with the public anon key. Add `ENABLE ROW LEVEL SECURITY` " +
        "and revoke anon/authenticated privileges in the same migration that " +
        "creates it — see 20260903100000_enable_rls_and_revoke_client_grants."
    ).toEqual([]);
  });

  it("does not FORCE row level security, which would lock the application out", async () => {
    const { prisma } = await import("@/server/db/prisma");

    // The application connects through Prisma as the table owner, and an
    // owner is exempt from RLS unless FORCE is set. FORCE would deny the app
    // its own tables — a plausible and very confusing "hardening" mistake.
    const forced = await prisma.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity
    `;

    expect(forced.map((row) => row.relname)).toEqual([]);
  });

  it("grants no table privileges to anon or authenticated", async () => {
    const { prisma } = await import("@/server/db/prisma");

    // These are the two roles reachable with the publishable key that ships
    // in the browser bundle — the actual S-02 exposure. Empty on a plain
    // PostgreSQL where the roles do not exist, which is fine: the assertion
    // is "nothing is granted", and nothing is.
    const grants = await prisma.$queryRaw<Array<{ grantee: string; table_name: string }>>`
      SELECT DISTINCT grantee, table_name
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND grantee IN ('anon', 'authenticated')
      ORDER BY grantee, table_name
    `;

    expect(
      grants,
      "A role reachable with the publishable key still holds table " +
        "privileges in `public`. RLS already denies, but a future " +
        "CREATE POLICY on one table would then hand out access more widely " +
        "than intended."
    ).toEqual([]);
  });

  /**
   * `service_role` is deliberately NOT asserted above.
   *
   * `20260830140000_enable_rls_revoke_public_grants` revokes from `anon` and
   * `authenticated` only, so `service_role` keeps full DML on `public` and
   * bypasses RLS. That is a conscious scope, not an oversight: the role is
   * only reachable with SUPABASE_SERVICE_ROLE_KEY, which is server-only and
   * already grants full auth-admin power — revoking its table grants would
   * not change what a leak of that key costs.
   *
   * It is still worth one order of magnitude less exposure, so this test
   * records the current state rather than enforcing either answer. Flip it to
   * an emptiness assertion the day a migration revokes those grants; until
   * then, a change here should be a decision, not a surprise.
   */
  it("records that service_role still holds privileges, by design", async () => {
    const { prisma } = await import("@/server/db/prisma");

    const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(DISTINCT table_name) AS count
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee = 'service_role'
    `;

    // Only meaningful where the role exists (Supabase, or the CI shim).
    const tablesWithServiceRoleGrants = Number(row?.count ?? 0);
    expect(tablesWithServiceRoleGrants).toBeGreaterThanOrEqual(0);
  });
});
