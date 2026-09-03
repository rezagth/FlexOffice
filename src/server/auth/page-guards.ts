import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import type { Role } from "@/generated/prisma/client";
import { safeRedirectPath } from "@/lib/validation/redirect";
import { PATHNAME_HEADER } from "@/proxy";
import { logEvent } from "@/server/lib/logger";
import type { Capability } from "./capabilities";
import { getAuthContext, type AuthContext } from "./rbac";
import { dashboardPathFor, dashboardPathForRole } from "./redirect-for-role";

/**
 * Role and capability guards for Server Component pages.
 *
 * Why these exist rather than calling `requireCapability()` in a page: a page
 * wants a redirect, not a 403. The rbac.ts helpers throw, which in a Server
 * Component renders the error boundary — correct for a route handler, hostile
 * for a human who simply followed a stale link.
 *
 * Why pages need a guard at all when the layout already has one: the layout
 * check is real, but it is the *only* check, which makes every page beneath
 * it dependent on staying in that exact segment. Move a page, rename a
 * folder, refactor a layout, and the protection silently disappears with no
 * test noticing. Each page asserting its own requirement is defence in depth,
 * and it is cheap: `getAuthContext()` runs once per request either way.
 */

/**
 * The path the visitor actually asked for, so signing in returns them to it.
 *
 * A Server Component cannot read the pathname, and the `/app` layout guard
 * runs before any page — so without this every unauthenticated visitor lands
 * on `/app` after signing in, whatever deep link they followed. `src/proxy.ts`
 * forwards it in a header it always overwrites, and `safeRedirectPath()`
 * validates it here: a client-supplied value cannot become an open redirect.
 */
async function requestedPath(): Promise<string | undefined> {
  try {
    const requestHeaders = await headers();
    const pathname = requestHeaders.get(PATHNAME_HEADER);
    if (!pathname) return undefined;
    const safe = safeRedirectPath(pathname, "/app");
    return safe === "/app" ? undefined : safe;
  } catch (error) {
    // headers() throws Next's own dynamic-rendering signal during static
    // generation — let Next handle that (see the identical reasoning in
    // rbac.ts's getAuthContext()) rather than treating it as the "outside a
    // request scope" case below, which is for a genuinely different
    // situation (this ran, but there was no real request to read from).
    unstable_rethrow(error);
    return undefined;
  }
}

/** Requires a signed-in caller. The baseline for anything under `/app`. */
export async function requirePageAuth(
  options: { redirectTo?: string } = {}
): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    const target = options.redirectTo ?? (await requestedPath()) ?? "/app";
    redirect(`/login?redirectTo=${encodeURIComponent(target)}`);
  }
  return ctx;
}

/**
 * Requires a capability, resolved server-side from the platform role, the
 * landlord flag and the ACTIVE organization membership.
 *
 * This is the guard new pages should use. It does NOT check the active mode:
 * the mode says what the user is looking at, the capability says what they
 * may do. A landlord page reached in tenant mode is a navigation accident, so
 * the caller is sent to their own home rather than shown a 403.
 */
export async function requirePageCapability(
  capability: Capability,
  options: { redirectTo?: string } = {}
): Promise<AuthContext> {
  const ctx = await requirePageAuth(options);

  if (!ctx.capabilities.has(capability)) {
    logEvent({
      event: "authz.page_capability_denied",
      user_id: ctx.userId,
      required_capability: capability,
      active_mode: ctx.activeMode,
      org_role: ctx.activeOrgRole ?? "none",
    });
    redirect(dashboardPathFor(ctx));
  }

  return ctx;
}

/**
 * Requires a usable landlord context, and returns a non-nullable
 * `activeOrgId` so every landlord page scopes its queries by a value that
 * came from the verified session and a re-read membership.
 *
 * An account that has not opened a letting activity is sent to the journey
 * that opens one, rather than to a dead end.
 */
export async function requirePageLandlordOrg(
  capability: Capability = "landlord:view_dashboard"
): Promise<AuthContext & { activeOrgId: string; organizationId: string }> {
  const ctx = await requirePageAuth();

  if (!ctx.isLandlord) {
    redirect("/app/become-landlord");
  }

  if (!ctx.activeOrgId || !ctx.capabilities.has(capability)) {
    logEvent({
      event: "authz.page_capability_denied",
      user_id: ctx.userId,
      required_capability: capability,
      org_role: ctx.activeOrgRole ?? "none",
      reason: ctx.activeOrgId ? "capability_missing" : "no_active_organization",
    });
    redirect(dashboardPathFor(ctx));
  }

  return ctx as AuthContext & { activeOrgId: string; organizationId: string };
}

/** Requires platform administration. Unrelated to the tenant/landlord modes. */
export async function requirePageAdmin(): Promise<AuthContext> {
  return requirePageCapability("admin:access_backoffice", {
    redirectTo: "/admin/dashboard",
  });
}

/**
 * Requires a signed-in caller holding a legacy role.
 *
 * @deprecated Phase 2 compatibility. `ctx.role` is derived from
 * `platformRole` + `activeMode`, so this asks about the mode rather than
 * about permission. Kept only for the `/client`, `/partner` and `/admin`
 * routes that still exist during the progressive migration to `/app`; those
 * routes now redirect, so the last call sites are the admin pages. Use
 * `requirePageCapability` or `requirePageAdmin`.
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
    redirect(dashboardPathFor(ctx));
  }

  return ctx;
}

/**
 * @deprecated Phase 2 compatibility, superseded by
 * `requirePageLandlordOrg()`. Kept so any remaining caller compiles.
 */
export async function requirePageOrg(): Promise<
  AuthContext & { organizationId: string; activeOrgId: string }
> {
  return requirePageLandlordOrg();
}
