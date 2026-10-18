import { prisma } from "@/server/db/prisma";
import { ForbiddenError } from "@/server/lib/errors";
import { canOrganizationPublish } from "./publication-guard";

/**
 * PRD V1.1, R72/R73 — a company that only rents (no landlord capability
 * unlocked) must be verified before it can book, exactly like a company must
 * be verified before it can publish (publication-guard.ts): "une société
 * vérifiée vaut pour ses deux rôles" cuts the other way too — one
 * unverified company is blocked from both. A plain individual tenant (no
 * organization membership at all) is never subject to this check — R72/R73
 * only ever gate a company, never a person.
 *
 * Deliberately NOT routed through getAuthContext()/activeOrgId: those only
 * resolve an organization once `Profile.isLandlord` is set
 * (active-context.ts), so a tenant-only company — which never sets it —
 * would never surface there. This reads the membership directly instead,
 * so nothing here touches rbac.ts or active-context.ts.
 *
 * Reuses `canOrganizationPublish()` on purpose: "verified" is one fact about
 * an organization, not a different one per action it gates. If that
 * threshold ever changes, both the booking gate and the publish gate move
 * together automatically.
 */
export async function assertClientCompanyIsVerified(clientUserId: string): Promise<void> {
  const membership = await prisma.organizationMember.findFirst({
    where: { profileId: clientUserId, status: "ACTIVE" },
    select: { organization: { select: { status: true, name: true } } },
  });
  if (!membership) return;

  if (!canOrganizationPublish(membership.organization.status)) {
    throw new ForbiddenError(
      `${membership.organization.name} n'est pas encore vérifiée : la réservation n'est pas possible tant que le dossier n'est pas approuvé.`
    );
  }
}
