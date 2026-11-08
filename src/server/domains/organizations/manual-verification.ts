import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/lib/errors";
import { createInAppNotification } from "@/server/domains/notifications/in-app";

/**
 * Back-office validation of a company that does not let spaces — in
 * practice a tenant-only company, which has no self-service route to
 * verification (the dossier lives in the landlord space) yet cannot book
 * until it is VERIFIED (company-verification-guard.ts).
 *
 * WHY THIS DOES NOT BREAK "ONLY review.ts MAKES AN ORGANIZATION VERIFIED"
 * That rule exists so a landlord organization never publishes without an
 * approved dossier behind it. So this refuses any organization with a
 * landlord member, and any whose dossier is under review: those go through
 * Vérifications, evidence and decision included. What remains is an
 * organization that never applied to let spaces (it only holds the DRAFT
 * dossier every company gets at signup), validated by an admin's own
 * decision, recorded in the audit log with who and why.
 *
 * Never lifts a suspension (that is `reactivateOrganization`'s decision),
 * and an administrator cannot validate a company they belong to.
 */
export async function verifyOrganizationManually(actorUserId: string, organizationId: string, reason?: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, status: true },
  });
  if (!organization) throw new NotFoundError("Organisation introuvable");
  if (organization.status === "VERIFIED") return { status: organization.status, changed: false };
  if (organization.status === "SUSPENDED") {
    throw new ConflictError("Cette société est suspendue : réactivez-la d'abord.");
  }

  const members = await prisma.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { profileId: true, orgRole: true, profile: { select: { isLandlord: true } } },
  });
  // A company that lets spaces is verified through its dossier, evidence and
  // decision included — never through this shortcut.
  if (members.some((m) => m.profile.isLandlord)) {
    throw new ConflictError("Cette société publie des espaces : traitez son dossier depuis la page Vérifications.");
  }
  const dossierInReview = await prisma.landlordVerification.findFirst({
    where: { organizationId, status: { in: ["PENDING_REVIEW", "IN_REVIEW"] } },
    select: { id: true },
  });
  if (dossierInReview) {
    throw new ConflictError("Un dossier de vérification est en cours d'examen : traitez-le depuis la page Vérifications.");
  }
  if (members.some((m) => m.profileId === actorUserId)) {
    throw new ForbiddenError("Un administrateur ne peut pas valider sa propre société.");
  }

  const updated = await prisma.organization.updateMany({
    where: { id: organizationId, status: "PENDING_VERIFICATION" },
    data: { status: "VERIFIED" },
  });
  if (updated.count === 0) return { status: "PENDING_VERIFICATION" as const, changed: false };

  await recordAudit({
    event: "organization.verified_manually",
    actorUserId,
    organizationId,
    metadata: { reason: reason ?? null },
  });

  // The person waiting on this is told in the app, where the checklist
  // already shows the step.
  for (const member of members.filter((m) => m.orgRole === "OWNER")) {
    await createInAppNotification({
      recipientProfileId: member.profileId,
      type: "VERIFICATION_APPROVED",
      title: "Société vérifiée",
      body: `${organization.name} est vérifiée : vous pouvez réserver un espace.`,
      link: "/app",
    });
  }

  return { status: "VERIFIED" as const, changed: true };
}
