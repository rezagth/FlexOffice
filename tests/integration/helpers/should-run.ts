/**
 * Gates for the integration suites.
 *
 * There used to be a single flag, `hasRealBackend`, requiring INTEGRATION=1 —
 * and in practice a Supabase project too, because every suite reached for the
 * admin client. That coupling meant CI could run none of them, including the
 * ones carrying security invariants. So the gate is split by what a suite
 * actually needs:
 *
 *   hasDatabase   INTEGRATION=1 and a DATABASE_URL. Enough for schema-level
 *                 facts: RLS, CHECK and EXCLUDE constraints, time zones,
 *                 tenant scoping, anonymisation, listing visibility. This is
 *                 what CI provides, using an ephemeral PostgreSQL plus
 *                 tests/sql/auth-schema-shim.sql to stand in for Supabase's
 *                 `auth` schema and its PostgREST roles.
 *
 *   hasSupabase   also a real Supabase project. Required only where the real
 *                 auth path IS the thing under test — a hostile signup
 *                 through /auth/v1/signup, or anything using the admin API.
 *
 *   hasServer     also a running instance of the app, because Route Handlers
 *                 use `next/headers` cookies(), which only works inside
 *                 Next's own request lifecycle and throws outside it — so a
 *                 real server has to be the one receiving the request.
 *
 * To run everything locally:
 *   INTEGRATION=1 TEST_BASE_URL=http://localhost:3000 pnpm test
 * See README.md "Tests".
 */

function env(name: string): string | undefined {
  // "" means absent, same convention as the rest of the codebase.
  return process.env[name] || undefined;
}

const integrationEnabled = process.env.INTEGRATION === "1";

/** A reachable PostgreSQL with the migrations applied. */
export const hasDatabase = integrationEnabled && Boolean(env("DATABASE_URL"));

/** A real Supabase project, with the service role key for cleanup. */
export const hasSupabase =
  hasDatabase &&
  Boolean(
    env("NEXT_PUBLIC_SUPABASE_URL") &&
      env("NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
      env("SUPABASE_SERVICE_ROLE_KEY")
  );

/** A running app instance answering on TEST_BASE_URL, plus Supabase. */
export const hasServer = hasSupabase && Boolean(env("TEST_BASE_URL"));

// NOT `BASE_URL`: Vite (and therefore Vitest) reserves that name for the
// app's public base path and forces it to "/", which silently turned every
// request into `fetch("//api/...")` and made these tests unrunnable no
// matter how the variable was set on the command line.
export const baseUrl = env("TEST_BASE_URL") ?? "http://localhost:3000";

/**
 * Kept so any suite still importing the old name keeps compiling. Equivalent
 * to the strictest gate, which is what it always effectively meant.
 * @deprecated prefer hasDatabase / hasSupabase / hasServer.
 */
export const hasRealBackend = hasSupabase;
