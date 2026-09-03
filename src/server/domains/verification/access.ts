import { prisma } from "@/server/db/prisma";
import { findActiveMembership } from "@/server/auth/active-context";
import { capabilitiesForOrgRole } from "@/server/auth/capabilities";
import { requireAuth, type AuthContext } from "@/server/auth/rbac";
import { ForbiddenError, NotFoundError } from "@/server/lib/errors";
import { logEvent } from "@/server/lib/logger";

/**
 * The one place every self-service verification route resolves "may this
 * caller touch this dossier".
 *
 * DELIBERATELY SEPARATE FROM /api/admin/verifications
 * A platform administrator does NOT get a bypass here. Reviewing a dossier
 * (`/api/admin/verifications/*`, requireAdmin()) and managing your own
 * organization's dossier are different jobs; an admin who could also upload
 * into an applicant's dossier through this path would be uploading the very
 * evidence they are supposed to be reviewing. Keeping the two namespaces
 * cleanly separated is simpler to audit than a shared path with a bypass
 * flag threaded through it.
 *
 * WHY THE ORGANIZATION IS RE-CHECKED HERE RATHER THAN TRUSTING `ctx.activeOrgId`
 * Phase 2 restricts an account to one landlord organization, so in the
 * common case `ctx.activeOrgId` already equals the verification's
 * organization. But the verification id in the URL is client-supplied, and
 * trusting that it matches the caller's own organization without checking
 * is exactly the class of bug `requireOrganizationAccess()` exists to
 * prevent elsewhere in the codebase. This re-derives the membership from the
 * verification's ACTUAL organization, every time.
 *
 * Only OWNER and org ADMIN hold `landlord:manage_verification` — see
 * capabilities.ts. A MANAGER, ACCOUNTANT or VIEWER member of the same
 * organization is a legitimate member and still gets 403 here, because the
 * documents involved are exactly what separation of duties keeps away from
 * an operational or read-only role.
 */
export async function requireVerificationOwnerAccess(verificationId: string) {
  const verification = await prisma.landlordVerification.findUnique({
    where: { id: verificationId },
    include: { organization: { select: { id: true, name: true, holderType: true } } },
  });
  if (!verification) {
    throw new NotFoundError("Dossier introuvable");
  }

  const ctx = await requireOrgMembershipWithVerificationCapability(
    verification.organizationId
  );

  return { ctx, verification };
}

async function requireOrgMembershipWithVerificationCapability(
  organizationId: string
): Promise<AuthContext> {
  const ctx = await requireAuth();

  const membership = await findActiveMembership(ctx.userId, organizationId);
  const allowed = membership
    ? capabilitiesForOrgRole(membership.orgRole).includes("landlord:manage_verification")
    : false;

  if (!allowed) {
    logEvent({
      event: "authz.denied",
      user_id: ctx.userId,
      reason: membership ? "insufficient_org_role" : "not_a_member",
      required_capability: "landlord:manage_verification",
      organization_id: organizationId,
    });
    throw new ForbiddenError("Vous n'êtes pas autorisé à gérer ce dossier.");
  }

  return ctx;
}
