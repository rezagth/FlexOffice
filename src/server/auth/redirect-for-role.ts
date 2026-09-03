import type { Role } from "@/generated/prisma/client";
import type { AuthContext } from "./rbac";

/**
 * Where a signed-in caller belongs.
 *
 * Phase 2 collapsed three destinations into one: `/app` serves both modes on
 * the same account, so there is nothing to choose between. The only genuine
 * fork left is platform administration, which is a different job rather than
 * a different mode.
 *
 * Deliberately NOT derived from the active mode. Sending a landlord to a
 * different URL than a tenant is what made the old routes a de facto account
 * type — the mode changes what `/app` shows, not where it lives.
 */
export function dashboardPathFor(ctx: AuthContext): string {
  return ctx.platformRole === "ADMIN" ? "/admin/dashboard" : "/app";
}

/**
 * @deprecated Phase 2 compatibility. The legacy `Role` is now derived from
 * `platformRole` + `activeMode`, so mapping it back to a path reintroduces
 * the conflation the phase removed. Use `dashboardPathFor(ctx)`.
 *
 * Kept for the guards that still take a `Role` while `/client`, `/partner`
 * and `/admin` exist. CLIENT and PARTNER both resolve to `/app` — the old
 * paths redirect there anyway, and returning them would bounce a caller
 * through a redirect for no reason.
 */
export function dashboardPathForRole(role: Role): string {
  return role === "ADMIN" ? "/admin/dashboard" : "/app";
}
