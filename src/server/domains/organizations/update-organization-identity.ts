import { prisma } from "@/server/db/prisma";
import { ConflictError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { isDuplicateSiret } from "./create-organization-with-verification";

/**
 * PRD V1.1, R81 — editing the SIRET or the legal name of an organization
 * that was already approved sends it back to review: the dossier an admin
 * signed off on no longer describes the same company. Never retroactive
 * (R64, R76): issued invoices and confirmed bookings are untouched, this
 * only changes the organization row and, when applicable, the verification
 * dossier and the organization's own `status`.
 *
 * Only an APPROVED dossier is demoted. A DRAFT or REJECTED one is already in
 * an editable, pre-approval state — nothing to protect there. A
 * PENDING_REVIEW/IN_REVIEW one is already queued; resetting it again would
 * just lose the admin's "review started" progress for no benefit.
 *
 * No-op (and no audit entry) when neither field actually changes — the
 * route this backs re-sends the whole company form on every save, so most
 * calls carry identical values.
 */
export async function updateOrganizationIdentity(
  organizationId: string,
  input: { siret?: string; legalName?: string },
  actorUserId: string
) {
  const existing = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  const siretChanged = input.siret !== undefined && input.siret !== existing.siret;
  const legalNameChanged = input.legalName !== undefined && input.legalName !== existing.legalName;
  if (!siretChanged && !legalNameChanged) {
    return { organization: existing, reverification: false as const };
  }

  let result: { organization: typeof existing; reverification: boolean };
  try {
    result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.update({
        where: { id: organizationId },
        data: {
          ...(input.siret !== undefined ? { siret: input.siret } : {}),
          ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
        },
      });

      const latest = await tx.landlordVerification.findFirst({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      });

      let reverification = false;
      if (latest && latest.status === "APPROVED") {
        await tx.landlordVerification.update({
          where: { id: latest.id },
          data: {
            status: "PENDING_REVIEW",
            submittedAt: new Date(),
            reviewStartedAt: null,
            reviewedAt: null,
            reviewedByProfileId: null,
            rejectionReason: null,
          },
        });
        // The ONE other place Organization.status leaves VERIFIED outside
        // suspension (see review.ts's comment on the symmetric transition
        // into VERIFIED): a changed identity means the approval no longer
        // describes this organization, so publishing/booking are paused
        // again until it is re-approved.
        await tx.organization.update({
          where: { id: organizationId },
          data: { status: "PENDING_VERIFICATION" },
        });
        reverification = true;
      }

      return { organization, reverification };
    });
  } catch (error) {
    if (isDuplicateSiret(error)) {
      throw new ConflictError(
        "Une entreprise avec ce SIRET est déjà inscrite. Contactez le support si vous pensez qu'il s'agit de la vôtre."
      );
    }
    throw error;
  }

  await recordAudit({
    event: "organization.identity_changed",
    actorUserId,
    organizationId,
    metadata: { siretChanged, legalNameChanged, reverification: result.reverification },
  });

  return result;
}
