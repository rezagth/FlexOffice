import type { HolderType, LandlordVerification } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, ValidationError } from "@/server/lib/errors";
import {
  missingDocumentTypes,
  VERIFICATION_DOCUMENT_TYPE_LABELS,
} from "./requirements";

const SUBMITTABLE_STATUSES = new Set(["DRAFT", "REJECTED"]);

/**
 * Moves a dossier from DRAFT (or REJECTED, after correction) to
 * PENDING_REVIEW.
 *
 * The completeness check reads the SAME `requiredDocumentTypes()` function
 * the onboarding UI uses to show which upload slots exist, so "what the UI
 * asked for" and "what the server accepts" can never quietly drift apart.
 * It checks presence of a type, not any per-document review status — an
 * admin judging a document unconvincing is what rejection is for, not a
 * silent server-side veto before a human ever sees it.
 */
export async function submitVerification({
  verification,
  organizationId,
  holderType,
  actorProfileId,
}: {
  verification: Pick<LandlordVerification, "id" | "status" | "activityType">;
  organizationId: string;
  holderType: HolderType;
  actorProfileId: string;
}) {
  if (!SUBMITTABLE_STATUSES.has(verification.status)) {
    throw new ConflictError(
      "Ce dossier ne peut pas être soumis dans son état actuel."
    );
  }

  const documents = await prisma.verificationDocument.findMany({
    where: { verificationId: verification.id },
    select: { type: true },
  });
  const missing = missingDocumentTypes(
    holderType,
    verification.activityType,
    documents.map((d) => d.type)
  );
  if (missing.length > 0) {
    const labels = missing.map((type) => VERIFICATION_DOCUMENT_TYPE_LABELS[type]);
    throw new ValidationError(
      `Documents manquants : ${labels.join(", ")}.`
    );
  }

  const updated = await prisma.landlordVerification.update({
    where: { id: verification.id },
    data: {
      status: "PENDING_REVIEW",
      submittedAt: new Date(),
      // A stale reason from a previous rejection would otherwise sit next to
      // a status that no longer means "rejected".
      rejectionReason: null,
    },
  });

  await recordAudit({
    event: "verification.submitted",
    actorUserId: actorProfileId,
    organizationId,
    metadata: { verificationId: verification.id },
  });

  return updated;
}
