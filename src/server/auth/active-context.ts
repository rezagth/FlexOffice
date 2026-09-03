import type { ActiveMode, OrgRole } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { logEvent } from "@/server/lib/logger";

/**
 * Resolves the active context — which mode, and which organization — for one
 * request.
 *
 * WHERE THE ACTIVE CONTEXT IS STORED, AND WHY
 * In two columns on `profiles`, not in a cookie. A cookie would need signing,
 * a key to manage and rotate, and a policy for a stale signature; a column
 * cannot be forged at all, which removes the class of problem rather than
 * mitigating it. `getAuthContext()` already loads the profile, so reading it
 * is free.
 *
 * WHY IT IS STILL REVALIDATED ON EVERY REQUEST
 * Unforgeable is not the same as currently valid. `active_organization_id`
 * records a choice made earlier; between then and now the membership may have
 * been revoked, the role downgraded, or the organization deleted. So the
 * stored id is treated as a *hint* and every request re-reads the membership:
 * no ACTIVE row, no landlord context, whatever the column says.
 *
 * The mode is subject to the same rule from the other direction. A stored
 * LANDLORD mode with no valid membership resolves to TENANT rather than
 * granting a landlord view of nothing — and the caller is told, so the UI can
 * explain instead of silently showing an empty dashboard.
 */

export type ActiveContext = {
  activeMode: ActiveMode;
  activeOrgId: string | null;
  activeOrgRole: OrgRole | null;
  /**
   * True when the stored mode was LANDLORD but no valid membership backed it,
   * so the request was served as TENANT instead.
   */
  landlordContextUnavailable: boolean;
};

/** An organization the caller can currently act for. */
export type MembershipSummary = {
  organizationId: string;
  organizationName: string;
  orgRole: OrgRole;
};

/**
 * The single query every landlord authorization decision rests on.
 *
 * Scoped by `profileId` from the verified session, and by `status: ACTIVE` —
 * an INVITED member has not accepted yet and a REVOKED one is gone. Returns
 * null rather than throwing: "not a member" is an ordinary answer.
 */
export async function findActiveMembership(
  profileId: string,
  organizationId: string
): Promise<MembershipSummary | null> {
  const membership = await prisma.organizationMember.findFirst({
    where: { profileId, organizationId, status: "ACTIVE" },
    select: {
      organizationId: true,
      orgRole: true,
      organization: { select: { name: true } },
    },
  });
  if (!membership) return null;

  return {
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    orgRole: membership.orgRole,
  };
}

/** Every organization the caller may currently act for. Drives the picker. */
export async function listActiveMemberships(
  profileId: string
): Promise<MembershipSummary[]> {
  const memberships = await prisma.organizationMember.findMany({
    where: { profileId, status: "ACTIVE" },
    select: {
      organizationId: true,
      orgRole: true,
      organization: { select: { name: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  return memberships.map((m) => ({
    organizationId: m.organizationId,
    organizationName: m.organization.name,
    orgRole: m.orgRole,
  }));
}

/**
 * Turns the stored preference into a validated context.
 *
 * Never trusts the stored organization id on its own. The order matters:
 *   1. Not a landlord at all -> tenant, no organization. Nothing to check.
 *   2. Landlord with a stored organization -> the membership must be ACTIVE.
 *   3. Landlord with no stored organization (or a stale one) -> fall back to
 *      the first organization they are actually a member of, so a revoked
 *      membership degrades to another valid one instead of a dead end.
 *   4. Landlord with no valid membership anywhere -> served as tenant, and
 *      the caller is told why.
 */
export async function resolveActiveContext(profile: {
  id: string;
  isLandlord: boolean;
  activeMode: ActiveMode;
  activeOrganizationId: string | null;
}): Promise<ActiveContext> {
  if (!profile.isLandlord) {
    // A tenant-only account cannot hold a landlord context. The database
    // CHECK makes the stored combination impossible too, so reaching here
    // with activeMode = LANDLORD would mean the constraint was dropped.
    return {
      activeMode: "TENANT",
      activeOrgId: null,
      activeOrgRole: null,
      landlordContextUnavailable: profile.activeMode === "LANDLORD",
    };
  }

  let membership: MembershipSummary | null = null;

  if (profile.activeOrganizationId) {
    membership = await findActiveMembership(profile.id, profile.activeOrganizationId);
    if (!membership) {
      // The stored choice is no longer valid — revoked, downgraded, or the
      // organization is gone. Worth a log: it is either a legitimate
      // off-boarding or someone probing.
      logEvent({
        event: "active_context.stale_organization_ignored",
        user_id: profile.id,
      });
    }
  }

  if (!membership) {
    const [fallback] = await listActiveMemberships(profile.id);
    membership = fallback ?? null;
  }

  if (!membership) {
    return {
      activeMode: "TENANT",
      activeOrgId: null,
      activeOrgRole: null,
      landlordContextUnavailable: true,
    };
  }

  return {
    // The stored mode is honoured only once a membership backs it.
    activeMode: profile.activeMode,
    activeOrgId: membership.organizationId,
    activeOrgRole: membership.orgRole,
    landlordContextUnavailable: false,
  };
}
