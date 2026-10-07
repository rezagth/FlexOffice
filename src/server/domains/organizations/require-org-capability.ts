import { requireCapability, type AuthContext } from "@/server/auth/rbac";
import type { Capability } from "@/server/auth/capabilities";
import { ForbiddenError } from "@/server/lib/errors";
import { logEvent } from "@/server/lib/logger";

export type OrgScopedContext = AuthContext & { organizationId: string; activeOrgId: string };

/**
 * `requireOrg()` answers "is this a landlord at all?" (landlord:view_dashboard,
 * which a VIEWER or an ACCOUNTANT also holds). Landlord routes that CHANGE
 * something must ask the real question instead (SEC-13): may this member
 * manage bookings / spaces / the calendar? Same scoping guarantee as
 * requireOrg(): the organization id comes from a re-verified ACTIVE
 * membership, never from the request.
 */
export async function requireOrgCapability(capability: Capability): Promise<OrgScopedContext> {
  const ctx = await requireCapability(capability);
  if (!ctx.activeOrgId) {
    // Unreachable while landlord capabilities require a resolved membership
    // (capabilities.ts) — kept so a future change cannot produce an
    // unscoped query.
    logEvent({ event: "authz.denied", user_id: ctx.userId, reason: "no_organization" });
    throw new ForbiddenError("Ce compte n'est rattaché à aucune organisation.");
  }
  return { ...ctx, organizationId: ctx.activeOrgId, activeOrgId: ctx.activeOrgId };
}
