import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/client";
import { logEvent } from "@/server/lib/logger";
import { getAuthContext, type AuthContext } from "./rbac";
import { dashboardPathForRole } from "./redirect-for-role";

/**
 * Role guards for Server Component pages.
 *
 * Why these exist rather than calling `requireRole()` in a page: a page wants
 * a redirect, not a 403. `requireRole()` throws, which in a Server Component
 * renders the error boundary — correct for a route handler, hostile for a
 * human who simply followed a stale link.
 *
 * Why pages need a guard at all when the layout already has one: the layout
 * check is real, but it is the *only* check, which makes every page beneath it
 * dependent on staying in that exact segment. Move a page, rename a folder,
 * refactor a layout, and the protection silently disappears with no test
 * noticing. Each page asserting its own requirement is defence in depth, and
 * it is cheap: `getAuthContext()` runs once per request either way.
 *
 * These are for pages only. Route handlers use `requireAuth` / `requireRole` /
 * `requireOrganizationAccess` from rbac.ts, which return proper HTTP statuses.
 */

/**
 * Requires a signed-in caller holding `role`.
 *
 * Not signed in -> /login, carrying the path to come back to.
 * Signed in with another role -> that role's own dashboard, so a PARTNER who
 * lands on a client URL is moved along instead of being shown a dead end.
 */
export async function requirePageRole(
  role: Role,
  options: { redirectTo?: string } = {}
): Promise<AuthContext> {
  const ctx = await getAuthContext();

  if (!ctx) {
    const target = options.redirectTo ?? dashboardPathForRole(role);
    redirect(`/login?redirectTo=${encodeURIComponent(target)}`);
  }

  if (ctx.role !== role) {
    logEvent({
      event: "authz.page_role_mismatch",
      user_id: ctx.userId,
      required_role: role,
      actual_role: ctx.role,
    });
    redirect(dashboardPathForRole(ctx.role));
  }

  return ctx;
}

/**
 * Requires a PARTNER page context with a resolved organization.
 *
 * Returns a non-nullable `organizationId` so every partner page scopes its
 * queries by a value that came from the verified session, and no page has to
 * fall back to `if (!ctx?.organizationId) return null`.
 */
export async function requirePageOrg(
  options: { redirectTo?: string } = {}
): Promise<AuthContext & { organizationId: string }> {
  const ctx = await requirePageRole("PARTNER", options);

  if (!ctx.organizationId) {
    // A PARTNER with no organization cannot be served a partner page at all.
    // This is a data anomaly (the signup trigger always creates one), so it
    // is logged rather than silently rendered as an empty dashboard.
    logEvent({ event: "authz.partner_without_organization", user_id: ctx.userId });
    redirect("/login?redirectTo=%2Fpartner%2Fdashboard");
  }

  return ctx as AuthContext & { organizationId: string };
}
