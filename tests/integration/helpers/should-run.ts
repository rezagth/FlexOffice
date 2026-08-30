/**
 * Integration tests in this folder make real HTTP requests against a
 * running instance of this app (`pnpm dev` or `pnpm build && pnpm start`),
 * backed by a real Supabase project. They can't call Route Handlers
 * directly as plain functions: those handlers use `next/headers`
 * `cookies()`, which only works inside Next's own request lifecycle and
 * throws when invoked outside it — so a real server has to be the one
 * receiving the request.
 *
 * Skipped by default so `pnpm test` works with no server and no Supabase
 * project configured. To run them: start the app, then
 *   INTEGRATION=1 TEST_BASE_URL=http://localhost:3000 pnpm test
 * See README.md "Tests".
 */
export const hasRealBackend = process.env.INTEGRATION === "1";
// NOT `BASE_URL`: Vite (and therefore Vitest) reserves that name for the
// app's public base path and forces it to "/", which silently turned every
// request into `fetch("//api/...")` and made these tests unrunnable no
// matter how the variable was set on the command line.
// `||`, not `??`, so an exported-but-empty value falls back too.
export const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
