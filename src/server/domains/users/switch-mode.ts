import type { ActiveMode } from "@/generated/prisma/client";
import type { SwitchModeInput } from "@/lib/validation/landlord";
import { findActiveMembership } from "@/server/auth/active-context";
import type { AuthContext } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { ForbiddenError } from "@/server/lib/errors";
import { logEvent } from "@/server/lib/logger";

/**
 * Switches the active mode, and optionally the organization being acted for.
 *
 * THE ASYMMETRY IS THE POINT
 *   LANDLORD -> TENANT   always allowed. Every account can rent a space, so
 *                        there is nothing to check.
 *   TENANT -> LANDLORD   allowed only for an account that has opened a
 *                        letting activity AND still holds an ACTIVE
 *                        membership of the organization it wants to act for.
 *
 * WHY THE MEMBERSHIP IS RE-READ HERE
 * `actor` already carries a resolved context, but that context was resolved
 * for *this* request against the *stored* organization. The caller may be
 * asking to switch to a different one, and `organizationId` in the payload
 * came from the browser. So it is treated as a target and checked:
 * `findActiveMembership()` is the authority, not the request.
 *
 * The database backs this up: `profiles_landlord_mode_requires_capability_check`
 * makes LANDLORD-without-`isLandlord` unrepresentable even for a direct SQL
 * write, so a bug here cannot produce an invalid stored state.
 */
export async function switchMode({
  actor,
  input,
}: {
  actor: AuthContext;
  input: SwitchModeInput;
}): Promise<{ activeMode: ActiveMode; activeOrgId: string | null }> {
  if (input.mode === "TENANT") {
    // The organization selection is kept rather than cleared, so switching
    // back to LANDLORD returns to the same organization instead of asking
    // again.
    await prisma.profile.update({
      where: { id: actor.userId },
      data: { activeMode: "TENANT" },
    });
    logEvent({ event: "account.mode_switched", user_id: actor.userId, mode: "TENANT" });
    return { activeMode: "TENANT", activeOrgId: actor.activeOrgId };
  }

  if (!actor.isLandlord) {
    // A tenant-only account cannot enter landlord mode by asking. The route
    // to it is "Devenir bailleur", not this endpoint.
    logEvent({
      event: "authz.denied",
      user_id: actor.userId,
      reason: "landlord_mode_without_capability",
    });
    throw new ForbiddenError(
      "Activez d'abord votre activité de bailleur pour utiliser ce mode."
    );
  }

  // Target organization: the requested one, else the one already selected.
  const targetOrgId = input.organizationId ?? actor.activeOrgId;
  if (!targetOrgId) {
    logEvent({
      event: "authz.denied",
      user_id: actor.userId,
      reason: "landlord_mode_without_organization",
    });
    throw new ForbiddenError("Aucune organisation active pour ce compte.");
  }

  // The check that stops `organizationId = someone_elses_org`. Knowing an id
  // grants nothing.
  const membership = await findActiveMembership(actor.userId, targetOrgId);
  if (!membership) {
    logEvent({
      event: "authz.denied",
      user_id: actor.userId,
      reason: "not_a_member_of_target_organization",
    });
    // Forbidden, not NotFound: no organization identifier is confirmed or
    // denied by this message — the caller learns only that they may not act
    // for whatever they asked about.
    throw new ForbiddenError("Vous n'êtes pas membre de cette organisation.");
  }

  await prisma.profile.update({
    where: { id: actor.userId },
    data: { activeMode: "LANDLORD", activeOrganizationId: membership.organizationId },
  });

  logEvent({
    event: "account.mode_switched",
    user_id: actor.userId,
    mode: "LANDLORD",
    organization_id: membership.organizationId,
    org_role: membership.orgRole,
  });

  return { activeMode: "LANDLORD", activeOrgId: membership.organizationId };
}
