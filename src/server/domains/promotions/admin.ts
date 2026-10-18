import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { createInAppNotification } from "@/server/domains/notifications/in-app";
import type { PromotionRejectionReason } from "@/generated/prisma/client";

/** A pending promotion older than this is flagged on the admin screen. */
export const PENDING_OVERDUE_HOURS = 48;

export const REJECTION_REASON_LABELS: Record<PromotionRejectionReason, string> = {
  INCONSISTENT_PRICE: "Prix incohérent",
  INVALID_DATES: "Dates invalides",
  INAPPROPRIATE_CONTENT: "Contenu inapproprié",
  MISSING_INFORMATION: "Informations manquantes",
  OTHER: "Autre",
};

/** The admin queue: pending promotions, OLDEST submitted first (R48-R52) —
 * unlike every other admin list in this codebase, which sorts newest first.
 * That inversion is deliberate here: a moderation queue should be worked in
 * the order requests arrived, not have new ones jump ahead of a request
 * already waiting. */
export async function listPendingPromotionsForAdmin() {
  const promotions = await prisma.promotion.findMany({
    where: { status: "PENDING" },
    orderBy: { submittedAt: "asc" },
    include: {
      organization: { select: { id: true, name: true } },
      spaces: { include: { space: { select: { id: true, name: true } } } },
    },
  });

  const overdueThreshold = Date.now() - PENDING_OVERDUE_HOURS * 60 * 60 * 1000;
  return promotions.map((promotion) => ({
    ...promotion,
    overdue: (promotion.submittedAt?.getTime() ?? 0) < overdueThreshold,
  }));
}

/**
 * Two published promotions must never both apply to the same space at the
 * same time — there would be no single answer to "what's the price". Not
 * asked for explicitly, but required for "the" discounted price to mean
 * anything; checked at approval time (the only moment a promotion actually
 * goes live), not at submission, so partners may freely draft overlapping
 * requests and let the admin's decision be what resolves the conflict.
 */
async function assertNoOverlap(
  promotionId: string,
  spaceIds: string[],
  startsAt: Date,
  endsAt: Date | null
): Promise<void> {
  const conflict = await prisma.promotion.findFirst({
    where: {
      id: { not: promotionId },
      status: "PUBLISHED",
      spaces: { some: { spaceId: { in: spaceIds } } },
      // Two intervals [s1,e1] and [s2,e2] overlap iff s1 <= e2 (or e2 null)
      // and s2 <= e1 (or e1 null, handled by omitting the filter below).
      ...(endsAt ? { startsAt: { lte: endsAt } } : {}),
      OR: [{ endsAt: null }, { endsAt: { gte: startsAt } }],
    },
    include: { spaces: { include: { space: { select: { name: true } } } } },
  });

  if (conflict) {
    const names = conflict.spaces.map((s) => s.space.name).join(", ");
    throw new ValidationError(
      `Une autre promotion publiée couvre déjà ${names} sur une période qui chevauche celle-ci. ` +
        "Refusez-la ou ajustez ses dates avant de pouvoir en publier une nouvelle sur les mêmes espaces."
    );
  }
}

async function notifyPromotionDecision(
  promotion: { id: string; organizationId: string; createdByProfileId: string | null },
  title: string,
  body: string
) {
  if (!promotion.createdByProfileId) return; // MIGRATED rows never reach moderation
  await createInAppNotification({
    recipientProfileId: promotion.createdByProfileId,
    type: "PROMOTION_STATUS_CHANGED",
    title,
    body,
    link: "/app/landlord/promotions",
  });
}

export async function approvePromotion(adminUserId: string, promotionId: string) {
  const promotion = await prisma.promotion.findUnique({
    where: { id: promotionId },
    include: { spaces: true },
  });
  if (!promotion) throw new NotFoundError("Promotion introuvable.");
  if (promotion.status !== "PENDING") {
    throw new ConflictError("Cette promotion n'est pas en attente de validation.");
  }

  await assertNoOverlap(
    promotion.id,
    promotion.spaces.map((s) => s.spaceId),
    promotion.startsAt,
    promotion.endsAt
  );

  const updated = await prisma.promotion.update({
    where: { id: promotionId },
    data: {
      status: "PUBLISHED",
      reviewedByProfileId: adminUserId,
      reviewedAt: new Date(),
      rejectionReason: null,
      rejectionNote: null,
    },
  });

  await recordAudit({
    event: "promotion.approved",
    actorUserId: adminUserId,
    organizationId: promotion.organizationId,
    metadata: { promotionId },
  });
  await notifyPromotionDecision(
    promotion,
    "Votre promotion a été approuvée",
    "Votre promotion est désormais publiée et s'applique aux réservations sur la période indiquée."
  );

  return updated;
}

export async function rejectPromotion(
  adminUserId: string,
  promotionId: string,
  reason: PromotionRejectionReason,
  note: string | undefined
) {
  const promotion = await prisma.promotion.findUnique({ where: { id: promotionId } });
  if (!promotion) throw new NotFoundError("Promotion introuvable.");
  if (promotion.status !== "PENDING") {
    throw new ConflictError("Cette promotion n'est pas en attente de validation.");
  }

  const updated = await prisma.promotion.update({
    where: { id: promotionId },
    data: {
      status: "REJECTED",
      reviewedByProfileId: adminUserId,
      reviewedAt: new Date(),
      rejectionReason: reason,
      rejectionNote: note?.trim() || null,
    },
  });

  await recordAudit({
    event: "promotion.rejected",
    actorUserId: adminUserId,
    organizationId: promotion.organizationId,
    metadata: { promotionId, reason },
  });
  await notifyPromotionDecision(
    promotion,
    "Votre promotion a été refusée",
    `Motif : ${REJECTION_REASON_LABELS[reason]}${note?.trim() ? ` — ${note.trim()}` : ""}.`
  );

  return updated;
}
