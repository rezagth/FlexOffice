import { prisma } from "@/server/db/prisma";
import { findActiveMembership } from "@/server/auth/active-context";
import { requireAuth, type AuthContext } from "@/server/auth/rbac";
import { ForbiddenError, NotFoundError } from "@/server/lib/errors";
import { logEvent } from "@/server/lib/logger";

/**
 * PRD V1.1, 2B — who may create/edit a domiciliation request or its
 * attestation: OWNER/ADMIN of the organization, same pair already trusted to
 * edit the organization's legal identity (account-organization-form.tsx /
 * update-organization-identity.ts) — a company's domiciliation is the same
 * category of decision.
 *
 * Deliberately NOT routed through `capabilitiesForOrgRole()`
 * (capabilities.ts is off-limits in this lot) and NOT through
 * `ctx.activeOrgId` (company-verification-guard.ts's same reasoning: a
 * tenant-only company never sets `isLandlord`, so `activeOrgId` would never
 * resolve for it) — this reads the membership directly, by the request's
 * OWN organizationId, never a client-supplied one trusted blindly.
 */
const ALLOWED_ORG_ROLES = new Set(["OWNER", "ADMIN"]);

export async function requireDomiciliationOrgAccess(organizationId: string): Promise<AuthContext> {
  const ctx = await requireAuth();
  const membership = await findActiveMembership(ctx.userId, organizationId);
  const allowed = membership ? ALLOWED_ORG_ROLES.has(membership.orgRole) : false;

  if (!allowed) {
    logEvent({
      event: "authz.denied",
      user_id: ctx.userId,
      reason: membership ? "insufficient_org_role" : "not_a_member",
      organization_id: organizationId,
      scope: "domiciliation",
    });
    throw new ForbiddenError("Vous n'êtes pas autorisé à gérer la domiciliation de cette organisation.");
  }

  return ctx;
}

export async function requireDomiciliationRequestAccess(requestId: string) {
  const request = await prisma.domiciliationRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError("Demande de domiciliation introuvable");

  const ctx = await requireDomiciliationOrgAccess(request.organizationId);
  return { ctx, request };
}
