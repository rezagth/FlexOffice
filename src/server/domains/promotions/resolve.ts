import { prisma } from "@/server/db/prisma";
import type { PromotionDiscount } from "./pricing";

export type ActivePromotion = {
  id: string;
  discount: PromotionDiscount;
};

/**
 * The PUBLISHED, currently-active (date range, usage cap) promotion for one
 * space, if any — the only thing a price may ever be discounted by.
 *
 * Usage-cap filtering is done here in application code rather than in the
 * Prisma `where` because Prisma cannot express a column-to-column
 * comparison (usageCount < usageLimit) without raw SQL; expected volume per
 * space is at most a handful of candidates, so fetching and filtering is not
 * a concern. requirePromotionNoOverlap() (admin.ts) keeps this list to at
 * most one real candidate in practice — this still picks the most recently
 * started one if that invariant is ever violated by data written outside
 * the normal approval path.
 */
export async function findActivePromotionForSpace(spaceId: string, at: Date): Promise<ActivePromotion | null> {
  const candidates = await prisma.promotion.findMany({
    where: {
      status: "PUBLISHED",
      startsAt: { lte: at },
      OR: [{ endsAt: null }, { endsAt: { gte: at } }],
      spaces: { some: { spaceId } },
    },
    orderBy: { startsAt: "desc" },
    select: { id: true, discountType: true, discountPercent: true, discountAmountCents: true, usageLimit: true, usageCount: true },
  });

  const promotion = candidates.find((p) => p.usageLimit === null || p.usageCount < p.usageLimit);
  if (!promotion) return null;

  const discount: PromotionDiscount =
    promotion.discountType === "PERCENTAGE"
      ? { type: "PERCENTAGE", percent: promotion.discountPercent! }
      : { type: "FIXED_AMOUNT", amountCents: promotion.discountAmountCents! };

  return { id: promotion.id, discount };
}
