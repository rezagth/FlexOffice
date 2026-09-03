import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/server/db/prisma";
import type {
  ActiveMode,
  OrgRole,
  PlatformRole,
  Role,
} from "@/generated/prisma/client";
import {
  ForbiddenError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "@/server/lib/errors";
import { logError, logEvent } from "@/server/lib/logger";
import { findActiveMembership, resolveActiveContext } from "./active-context";
import { resolveCapabilities, type Capability } from "./capabilities";
import { getAuthRuntimeMode, reportDegradedMode } from "./runtime-config";
import { createSupabaseServerClient } from "./supabase-server";

export type AuthContext = {
  userId: string;
  email: string;
  name: string;

  /** Who the caller is to the platform. Unrelated to the modes. */
  platformRole: PlatformRole;
  /** The landlord capability has been unlocked. NOT an authorization. */
  isLandlord: boolean;
  /** What the caller is currently doing. NOT an authorization. */
  activeMode: ActiveMode;
  /** Organization being acted for — validated against an ACTIVE membership. */
  activeOrgId: string | null;
  /** Role held in that organization. Null outside a landlord context. */
  activeOrgRole: OrgRole | null;
  /** What the caller may actually do. Computed server-side, never supplied. */
  capabilities: Set<Capability>;
  /**
   * The stored mode was LANDLORD but no valid membership backed it, so the
   * request is being served as a tenant. Lets the UI explain rather than
   * render an empty landlord dashboard.
   */
  landlordContextUnavailable: boolean;

  /**
   * @deprecated Phase 2 compatibility shim.
   *
   * Derived from the new fields, NOT read from `profiles.role`, so a caller
   * still switching on it sees a value consistent with the account model
   * rather than a stale column. Kept only so the remaining `/client`,
   * `/partner` and `/admin` code paths keep working during the progressive
   * route migration; every new call site uses `capabilities`, `platformRole`
   * or `activeMode`. Removed together with the old routes.
   */
  role: Role;
  /**
   * @deprecated use `activeOrgId`, which is revalidated against an ACTIVE
   * membership. This is the same value, exposed under the old name.
   */
  organizationId: string | null;
};

/**
 * Maps the new account model onto the retired `Role` enum.
 *
 * ADMIN wins because it is the platform dimension; otherwise the value
 * follows the active mode. This exists to keep old code compiling and
 * behaving during the migration — it is never an input to an authorization
 * decision.
 */
function legacyRoleFor(
  platformRole: PlatformRole,
  activeMode: ActiveMode
): Role {
  if (platformRole === "ADMIN") return "ADMIN";
  return activeMode === "LANDLORD" ? "PARTNER" : "CLIENT";
}

/**
 * Resolves the current authenticated user, or `null`.
 *
 * Always revalidates the JWT against Supabase via `getUser()` — never trusts
 * a decoded cookie value — before trusting anything from it.
 *
 * WHAT `null` MEANS, AND WHAT IT NO LONGER MEANS
 * `null` means one of two things, both legitimate: nobody is signed in, or
 * authentication is intentionally unavailable (demo mode, or configuration
 * missing outside production — see runtime-config.ts).
 *
 * It no longer means "something went wrong". A real failure — Supabase
 * unreachable, the database refusing connections, an unexpected exception —
 * now throws `ServiceUnavailableError`. Reporting an outage as an anonymous
 * visitor is how a broken production deployment ends up looking like a quiet
 * afternoon: every protected page redirects to /login, no error is raised and
 * nothing is logged.
 *
 * Callers that render for both signed-in and signed-out visitors keep using
 * this directly; the throw propagates to the nearest error boundary
 * (`src/app/error.tsx`) or, in a route handler, to `withErrorHandling` which
 * maps it to a 503.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const mode = getAuthRuntimeMode();
  if (mode !== "READY") {
    reportDegradedMode(mode);
    return null;
  }

  let userId: string;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      if (isInfrastructureAuthError(error)) {
        logError({ event: "auth.backend_unavailable", error });
        throw new ServiceUnavailableError("Authentication backend unavailable");
      }
      // Ordinary "no session" / expired or invalid token.
      return null;
    }
    if (!data.user) return null;
    userId = data.user.id;
  } catch (error) {
    // createSupabaseServerClient() calls cookies() (next/headers), which
    // throws Next's own internal "needs dynamic rendering" signal when this
    // runs during static generation (e.g. `next build` prerendering a page
    // that has no explicit `dynamic = "force-dynamic"`). That signal is not
    // an infrastructure failure — swallowing it into ServiceUnavailableError
    // used to fail the entire production build the moment real Supabase
    // env vars made this branch reachable. unstable_rethrow lets Next
    // recognize its own signal and correctly defer the route to request
    // time instead; only a genuine application error falls through below.
    unstable_rethrow(error);
    if (error instanceof ServiceUnavailableError) throw error;
    // createSupabaseServerClient() throwing, a fetch failure, anything else:
    // this is infrastructure, not a signed-out visitor.
    logError({ event: "auth.unexpected_failure", error });
    throw new ServiceUnavailableError("Authentication backend unavailable");
  }

  let profile;
  try {
    profile = await prisma.profile.findUnique({ where: { id: userId } });
  } catch (error) {
    logError({ event: "auth.profile_lookup_failed", error, user_id: userId });
    throw new ServiceUnavailableError("Profile store unavailable");
  }

  // Defensive: the `handle_new_user` trigger always creates a profile
  // alongside the auth user, so this should not happen in practice.
  if (!profile) {
    logEvent({ event: "auth.profile_missing", user_id: userId });
    return null;
  }

  // A GDPR-erased account is anonymized in place rather than removed (see
  // domains/users/gdpr.ts), so its profile row still exists and would
  // otherwise resolve to a usable session. The Supabase ban should already
  // stop it, but that is another system's timing — don't depend on it alone.
  if (profile.deletedAt) {
    logEvent({ event: "auth.deleted_account_rejected", user_id: userId });
    return null;
  }

  // The stored mode and organization are a preference, not a grant: the
  // membership is re-read here on every request, so a revoked or downgraded
  // membership takes effect immediately rather than at the next sign-in.
  let active;
  try {
    active = await resolveActiveContext(profile);
  } catch (error) {
    logError({ event: "auth.active_context_failed", error, user_id: userId });
    throw new ServiceUnavailableError("Membership store unavailable");
  }

  const capabilities = resolveCapabilities({
    platformRole: profile.platformRole,
    activeMode: active.activeMode,
    isLandlord: profile.isLandlord,
    activeOrgRole: active.activeOrgRole,
  });

  return {
    userId: profile.id,
    email: profile.email,
    name: profile.name,
    platformRole: profile.platformRole,
    isLandlord: profile.isLandlord,
    activeMode: active.activeMode,
    activeOrgId: active.activeOrgId,
    activeOrgRole: active.activeOrgRole,
    capabilities,
    landlordContextUnavailable: active.landlordContextUnavailable,
    // Compatibility shim — see legacyRoleFor().
    role: legacyRoleFor(profile.platformRole, active.activeMode),
    organizationId: active.activeOrgId,
  };
}

/**
 * Classifies a Supabase auth error as infrastructure or as "no valid session".
 *
 * Supabase reports both through the same channel, so the distinction has to be
 * made on the error itself:
 *   * `AuthRetryableFetchError` — the request never got an answer (network,
 *     DNS, timeout, 5xx from the auth service).
 *   * status >= 500 — the auth service answered, badly.
 * Everything else (missing session, expired JWT, 400/401/403) is an ordinary
 * signed-out state.
 */
function isInfrastructureAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; status?: unknown };
  if (candidate.name === "AuthRetryableFetchError") return true;
  return typeof candidate.status === "number" && candidate.status >= 500;
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    throw new UnauthorizedError();
  }
  return ctx;
}

/**
 * Throws 403 unless the caller holds the capability.
 *
 * THE authorization primitive. Server-side only, and derived from the
 * verified session plus an ACTIVE membership — never from the active mode,
 * a request body, or a layout having rendered.
 *
 * Prefer this over `requireRole`: it survives the arrival of custom
 * organization roles, and it makes the question at the call site the real one
 * ("may this caller publish?") instead of a proxy for it.
 */
export async function requireCapability(
  capability: Capability
): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.capabilities.has(capability)) {
    logEvent({
      event: "authz.denied",
      user_id: ctx.userId,
      required_capability: capability,
      active_mode: ctx.activeMode,
      org_role: ctx.activeOrgRole ?? "none",
    });
    throw new ForbiddenError("Not allowed to perform this action");
  }
  return ctx;
}

/** Requires platform administration rights. Independent of the modes. */
export async function requireAdmin(): Promise<AuthContext> {
  return requireCapability("admin:access_backoffice");
}

/**
 * Throws 403 unless the caller holds one of the given legacy roles.
 *
 * @deprecated Phase 2 compatibility. `ctx.role` is now derived from
 * `platformRole` + `activeMode` (see `legacyRoleFor`), so this asks a
 * question about the *mode* rather than about permission — which is exactly
 * the conflation Phase 2 removed. Use `requireCapability` or `requireAdmin`.
 * Kept while `/client`, `/partner` and `/admin` still exist.
 */
export async function requireRole(role: Role | Role[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(ctx.role)) {
    logEvent({
      event: "authz.denied",
      user_id: ctx.userId,
      required_role: allowed.join("|"),
      actual_role: ctx.role,
    });
    throw new ForbiddenError(`Requires role: ${allowed.join(" or ")}`);
  }
  return ctx;
}

/**
 * Requires a usable landlord context: the capability is unlocked, an ACTIVE
 * membership resolved, and the organization id is therefore non-nullable —
 * so every landlord query is scoped by a value that came from the verified
 * session and a re-read membership.
 *
 * Deliberately does NOT require `activeMode === "LANDLORD"`. The mode is what
 * the user is looking at; a route handler answering a landlord request is
 * authorized by the membership, not by which tab was open. Requiring the mode
 * would also make the API depend on UI state.
 */
export async function requireOrg(): Promise<AuthContext & { organizationId: string; activeOrgId: string }> {
  const ctx = await requireCapability("landlord:view_dashboard");
  if (!ctx.activeOrgId) {
    // Unreachable while landlord:view_dashboard is only granted alongside a
    // resolved membership — kept so a future change to the capability table
    // cannot silently produce an unscoped query.
    logEvent({ event: "authz.denied", user_id: ctx.userId, reason: "no_organization" });
    throw new ForbiddenError("This account is not linked to an organization");
  }
  return ctx as AuthContext & { organizationId: string; activeOrgId: string };
}

/**
 * Asserts the caller may act on behalf of `organizationId`.
 *
 * For any handler that receives an organization identifier from the client.
 * Knowing an id grants nothing: the answer comes from the verified session,
 * never from the request.
 *
 * ADMIN passes for every organization — that is the point of the back office.
 * Anyone else passes only where they hold an ACTIVE membership, which is
 * re-read here rather than compared against the stored active organization:
 * a member of three organizations may legitimately act for any of them, and
 * `activeOrgId` only records which one they last looked at.
 */
export async function requireOrganizationAccess(
  organizationId: string
): Promise<AuthContext> {
  const ctx = await requireAuth();

  if (ctx.platformRole === "ADMIN") return ctx;

  if (ctx.isLandlord) {
    const membership = await findActiveMembership(ctx.userId, organizationId);
    if (membership) return ctx;
  }

  logEvent({
    event: "authz.denied",
    user_id: ctx.userId,
    platform_role: ctx.platformRole,
    reason: "organization_mismatch",
  });
  // Deliberately ForbiddenError here rather than NotFoundError: the caller
  // already had to be authenticated, and no organization identifier is
  // confirmed or denied by this message. Handlers that resolve a *resource*
  // by id must still answer 404 for another tenant's row — see the
  // ownership rules in the security guardrails.
  throw new ForbiddenError("Not allowed to act for this organization");
}
