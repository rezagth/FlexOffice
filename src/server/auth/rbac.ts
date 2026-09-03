import { prisma } from "@/server/db/prisma";
import type { Role } from "@/generated/prisma/client";
import {
  ForbiddenError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "@/server/lib/errors";
import { logError, logEvent } from "@/server/lib/logger";
import { getAuthRuntimeMode, reportDegradedMode } from "./runtime-config";
import { createSupabaseServerClient } from "./supabase-server";

export type AuthContext = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string | null;
};

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

  return {
    userId: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    organizationId: profile.organizationId,
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
 * Throws 403 unless the caller holds one of the given roles.
 *
 * Server-side only. This — not a layout, not a hidden nav link — is the
 * authorization boundary. A layout guard protects the pages Next.js renders
 * beneath it and nothing else: it does not run for route handlers, and it
 * stops protecting a page the moment that page moves to another segment.
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
 * Requires a PARTNER whose profile is linked to an organization — the
 * `organizationId` used to scope every tenant-sensitive query.
 */
export async function requireOrg(): Promise<AuthContext & { organizationId: string }> {
  const ctx = await requireRole("PARTNER");
  if (!ctx.organizationId) {
    logEvent({ event: "authz.denied", user_id: ctx.userId, reason: "no_organization" });
    throw new ForbiddenError("This account is not linked to an organization");
  }
  return ctx as AuthContext & { organizationId: string };
}

/**
 * Asserts the caller may act on behalf of `organizationId`.
 *
 * For any handler that receives an organization identifier from the client.
 * Knowing an id grants nothing: the answer comes from the verified session,
 * never from the request.
 *
 * ADMIN passes for every organization — that is the point of the back office.
 * A PARTNER passes only for their own. Anyone else is refused.
 */
export async function requireOrganizationAccess(
  organizationId: string
): Promise<AuthContext> {
  const ctx = await requireAuth();

  if (ctx.role === "ADMIN") return ctx;

  if (ctx.role === "PARTNER" && ctx.organizationId === organizationId) return ctx;

  logEvent({
    event: "authz.denied",
    user_id: ctx.userId,
    actual_role: ctx.role,
    reason: "organization_mismatch",
  });
  // Deliberately ForbiddenError here rather than NotFoundError: the caller
  // already had to be authenticated, and no organization identifier is
  // confirmed or denied by this message. Handlers that resolve a *resource*
  // by id must still answer 404 for another tenant's row — see the
  // ownership rules in the security guardrails.
  throw new ForbiddenError("Not allowed to act for this organization");
}
