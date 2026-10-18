import { prisma } from "@/server/db/prisma";
import { findActiveMembership } from "@/server/auth/active-context";
import { requireAuth, type AuthContext } from "@/server/auth/rbac";
import { ForbiddenError, NotFoundError } from "@/server/lib/errors";
import { logEvent } from "@/server/lib/logger";

/**
 * PRD V1.1, lot 3, commit 2 — who may create/edit a promotion: OWNER/ADMIN
 * of the organization, same pair as every other object this engagement has
 * scoped this way (domiciliation-access.ts, company-verification-guard.ts).
 *
 * Deliberately NOT routed through `capabilitiesForOrgRole()`
 * (capabilities.ts is off-limits) and NOT through `ctx.activeOrgId` — reads
 * the membership directly, by the promotion's/space's OWN organizationId,
 * never one the client supplies and expects to be trusted.
 */
const ALLOWED_ORG_ROLES = new Set(["OWNER", "ADMIN"]);

export async function requirePromotionOrgAccess(organizationId: string): Promise<AuthContext> {
  const ctx = await requireAuth();
  const membership = await findActiveMembership(ctx.userId, organizationId);
  const allowed = membership ? ALLOWED_ORG_ROLES.has(membership.orgRole) : false;

  if (!allowed) {
    logEvent({
      event: "authz.denied",
      user_id: ctx.userId,
      reason: membership ? "insufficient_org_role" : "not_a_member",
      organization_id: organizationId,
      scope: "promotion",
    });
    throw new ForbiddenError("Vous n'êtes pas autorisé à gérer les promotions de cette organisation.");
  }

  return ctx;
}

export async function requirePromotionAccess(promotionId: string) {
  const promotion = await prisma.promotion.findUnique({ where: { id: promotionId } });
  if (!promotion) throw new NotFoundError("Promotion introuvable.");

  const ctx = await requirePromotionOrgAccess(promotion.organizationId);
  return { ctx, promotion };
}

/** Every space a promotion is attached to must actually belong to the
 * caller's own organization — an id known is not an id owned. 404, not 403:
 * a space out of scope does not confirm its own existence. */
export async function assertSpacesBelongToOrganization(organizationId: string, spaceIds: string[]): Promise<void> {
  const count = await prisma.space.count({ where: { id: { in: spaceIds }, organizationId } });
  if (count !== new Set(spaceIds).size) {
    throw new NotFoundError("Un ou plusieurs espaces sont introuvables.");
  }
}
