import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { assertSpacesBelongToOrganization } from "./access";
import type { PromotionInput } from "@/lib/validation/promotions";

/** The partner's own promotions, newest first — matches every other
 * partner-facing list in this codebase. */
export async function listPromotionsForOrganization(organizationId: string) {
  return prisma.promotion.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: { spaces: { include: { space: { select: { id: true, name: true } } } } },
  });
}

export async function getPromotionForOrganization(organizationId: string, promotionId: string) {
  const promotion = await prisma.promotion.findFirst({
    where: { id: promotionId, organizationId },
    include: { spaces: { include: { space: { select: { id: true, name: true } } } } },
  });
  if (!promotion) throw new NotFoundError("Promotion introuvable.");
  return promotion;
}

function discountFields(input: PromotionInput) {
  return input.discountType === "PERCENTAGE"
    ? { discountType: "PERCENTAGE" as const, discountPercent: input.discountPercent, discountAmountCents: null }
    : { discountType: "FIXED_AMOUNT" as const, discountPercent: null, discountAmountCents: input.discountAmountCents };
}

/** Always created as a DRAFT — submitPromotion() is the only way into the
 * admin queue, a separate, explicit action. */
export async function createPromotion(organizationId: string, actorUserId: string, input: PromotionInput) {
  await assertSpacesBelongToOrganization(organizationId, input.spaceIds);

  const promotion = await prisma.promotion.create({
    data: {
      organizationId,
      ...discountFields(input),
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      usageLimit: input.usageLimit ?? null,
      status: "DRAFT",
      createdByProfileId: actorUserId,
      spaces: { create: input.spaceIds.map((spaceId) => ({ spaceId })) },
    },
  });

  await recordAudit({
    event: "promotion.created",
    actorUserId,
    organizationId,
    metadata: { promotionId: promotion.id },
  });

  return promotion;
}

/**
 * Editing a DRAFT keeps it a DRAFT. Editing a PENDING keeps it queued (its
 * place in the admin queue — submittedAt — does not reset for a correction
 * made while already waiting). Editing a PUBLISHED or REJECTED promotion
 * sends it back to PENDING for a fresh review — R34-R39's "any change to a
 * published promotion reverts it to pending", extended to REJECTED since
 * the natural next step after a refusal is to fix it and resubmit, not a
 * separate submit action. An EXPIRED promotion is done — create a new one
 * instead of reviving it.
 */
export async function updatePromotion(
  organizationId: string,
  actorUserId: string,
  promotionId: string,
  input: PromotionInput
) {
  const existing = await prisma.promotion.findFirst({ where: { id: promotionId, organizationId } });
  if (!existing) throw new NotFoundError("Promotion introuvable.");
  if (existing.status === "EXPIRED") {
    throw new ConflictError("Une promotion expirée ne peut plus être modifiée : créez-en une nouvelle.");
  }

  await assertSpacesBelongToOrganization(organizationId, input.spaceIds);

  const backToReview = existing.status === "PUBLISHED" || existing.status === "REJECTED";

  const updated = await prisma.$transaction(async (tx) => {
    await tx.promotionSpace.deleteMany({ where: { promotionId } });
    await tx.promotionSpace.createMany({
      data: input.spaceIds.map((spaceId) => ({ promotionId, spaceId })),
    });
    return tx.promotion.update({
      where: { id: promotionId },
      data: {
        ...discountFields(input),
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        usageLimit: input.usageLimit ?? null,
        ...(backToReview
          ? {
              status: "PENDING" as const,
              submittedAt: new Date(),
              reviewedAt: null,
              reviewedByProfileId: null,
              rejectionReason: null,
              rejectionNote: null,
            }
          : {}),
      },
    });
  });

  await recordAudit({
    event: "promotion.updated",
    actorUserId,
    organizationId,
    metadata: { promotionId, backToReview },
  });

  return updated;
}

/** The only way a DRAFT or REJECTED promotion enters the admin queue. */
export async function submitPromotion(organizationId: string, actorUserId: string, promotionId: string) {
  const existing = await prisma.promotion.findFirst({ where: { id: promotionId, organizationId } });
  if (!existing) throw new NotFoundError("Promotion introuvable.");
  if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
    throw new ConflictError("Cette promotion ne peut pas être soumise dans son état actuel.");
  }

  const updated = await prisma.promotion.update({
    where: { id: promotionId },
    data: { status: "PENDING", submittedAt: new Date(), rejectionReason: null, rejectionNote: null },
  });

  await recordAudit({ event: "promotion.submitted", actorUserId, organizationId, metadata: { promotionId } });
  return updated;
}
