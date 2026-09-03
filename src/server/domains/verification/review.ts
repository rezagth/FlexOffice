import type { VerificationStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/lib/errors";

/**
 * Admin review of a submitted dossier.
 *
 * Not scoped by organization membership — an administrator reviews across
 * every organization by design, and the calling routes enforce
 * `requireAdmin()` (platform administration, not org membership).
 *
 * Cas 4 (self-review): an administrator who is ALSO the person who requested
 * this dossier — a platform admin can hold their own landlord activity, the
 * account model has no rule against it — must not be the one who approves or
 * rejects it. Checked at the top of every transition below, before anything
 * else, so the conflict of interest is refused before it can be argued with.
 */
function assertNotSelfReview(actorUserId: string, requestedByProfileId: string) {
  if (actorUserId === requestedByProfileId) {
    throw new ForbiddenError(
      "Un administrateur ne peut pas examiner son propre dossier."
    );
  }
}

async function loadVerificationOrThrow(verificationId: string) {
  const verification = await prisma.landlordVerification.findUnique({
    where: { id: verificationId },
  });
  if (!verification) throw new NotFoundError("Dossier introuvable");
  return verification;
}

/** PENDING_REVIEW -> IN_REVIEW. Marks that an admin has started looking. */
export async function takeChargeOfVerification(verificationId: string, actorUserId: string) {
  const verification = await loadVerificationOrThrow(verificationId);
  assertNotSelfReview(actorUserId, verification.requestedByProfileId);

  const updated = await prisma.landlordVerification.updateMany({
    where: { id: verificationId, status: "PENDING_REVIEW" },
    data: { status: "IN_REVIEW", reviewStartedAt: new Date() },
  });
  if (updated.count === 0) {
    throw new ConflictError("Ce dossier n'est pas en attente de prise en charge.");
  }

  await recordAudit({
    event: "verification.taken_in_charge",
    actorUserId,
    organizationId: verification.organizationId,
    metadata: { verificationId },
  });
}

const REVIEWABLE_STATUSES: VerificationStatus[] = ["PENDING_REVIEW", "IN_REVIEW"];

/**
 * Approves a dossier: the organization becomes VERIFIED, which is what
 * actually unblocks publication (see publication-guard.ts). This is the ONE
 * place `Organization.status` transitions to VERIFIED — a direct write
 * anywhere else would create a VERIFIED organization with no approved
 * dossier behind it.
 */
export async function approveVerification(verificationId: string, actorUserId: string) {
  const verification = await loadVerificationOrThrow(verificationId);
  assertNotSelfReview(actorUserId, verification.requestedByProfileId);

  if (!REVIEWABLE_STATUSES.includes(verification.status)) {
    throw new ConflictError("Ce dossier n'est pas en attente de décision.");
  }

  await prisma.$transaction([
    prisma.landlordVerification.updateMany({
      where: { id: verificationId, status: { in: REVIEWABLE_STATUSES } },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedByProfileId: actorUserId,
        rejectionReason: null,
      },
    }),
    prisma.organization.update({
      where: { id: verification.organizationId },
      data: { status: "VERIFIED" },
    }),
  ]);

  await recordAudit({
    event: "verification.approved",
    actorUserId,
    organizationId: verification.organizationId,
    metadata: { verificationId },
  });
}

/**
 * Rejects a dossier with a reason. Does NOT touch `Organization.status` —
 * rejection means "not yet", not suspension; the account keeps whatever
 * standing it already had and may correct the dossier and resubmit.
 */
export async function rejectVerification(
  verificationId: string,
  actorUserId: string,
  reason: string
) {
  const verification = await loadVerificationOrThrow(verificationId);
  assertNotSelfReview(actorUserId, verification.requestedByProfileId);

  if (!REVIEWABLE_STATUSES.includes(verification.status)) {
    throw new ConflictError("Ce dossier n'est pas en attente de décision.");
  }

  const updated = await prisma.landlordVerification.updateMany({
    where: { id: verificationId, status: { in: REVIEWABLE_STATUSES } },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedByProfileId: actorUserId,
      rejectionReason: reason,
    },
  });
  if (updated.count === 0) {
    throw new ConflictError("Ce dossier n'est pas en attente de décision.");
  }

  // The reason is admin-authored review commentary, not extracted document
  // content — kept here so the full history survives even though the
  // dossier's own `rejectionReason` field is overwritten on the next cycle.
  await recordAudit({
    event: "verification.rejected",
    actorUserId,
    organizationId: verification.organizationId,
    metadata: { verificationId, reason },
  });
}
