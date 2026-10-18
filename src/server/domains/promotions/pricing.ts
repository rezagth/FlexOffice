/**
 * PRD V1.1, R34-R39, R48-R52 — the one place a promotion discount turns into
 * an actual price. Isolated on purpose: the financial assumption this
 * engagement made explicit — the discount is borne by the partner
 * (landlord), and the platform's commission is computed on the
 * POST-discount price — lives only here, so changing who bears it later
 * touches this function and nothing else (payments/constants.ts's
 * computeCommissionCents already runs on whatever price this returns,
 * unchanged).
 *
 * Never trusts a discount amount from the client: callers always pass a
 * `PromotionDiscount` read from a PUBLISHED, currently-active Promotion row
 * (see resolve.ts), never a value out of a request body.
 */

/** Same floor as the old Space.discountPercent mechanism it replaces
 * (validation/spaces.ts's MIN_SLOT_PRICE_CENTS): a discounted slot can never
 * collect so little that the commission rounds to nothing. */
export const MIN_PROMOTION_FINAL_PRICE_CENTS = 100;

/** Same cap as the mechanism this replaces — a business rule, not a
 * mathematical one (100% would mean a free booking). */
export const MAX_PROMOTION_DISCOUNT_PERCENT = 90;

export type PromotionDiscount =
  | { type: "PERCENTAGE"; percent: number }
  | { type: "FIXED_AMOUNT"; amountCents: number };

export type PriceBreakdown = {
  originalPriceCents: number;
  discountAmountCents: number;
  finalPriceCents: number;
};

/**
 * Applies a discount to a price, in integer cents only. Guarantees, whatever
 * the inputs:
 *   - finalPriceCents is never negative and never below the floor;
 *   - discountAmountCents is derived as the difference (originalPriceCents -
 *     finalPriceCents), never computed and rounded separately — same "derive,
 *     don't re-round" rule as invoicing/vat.ts, so the two always add up to
 *     the original to the cent.
 *   - a FIXED_AMOUNT discount larger than the price itself never produces a
 *     negative or free price — it is capped at the price minus the floor.
 */
export function applyPromotionDiscount(priceCents: number, discount: PromotionDiscount | null): PriceBreakdown {
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new Error("applyPromotionDiscount: price must be a non-negative integer number of cents");
  }
  if (!discount) {
    return { originalPriceCents: priceCents, discountAmountCents: 0, finalPriceCents: priceCents };
  }

  // PERCENTAGE: floor the price actually owed (the remaining 100-percent%),
  // not the discount itself — flooring the discount instead would round the
  // final price UP, charging the client more than the percentage advertised
  // (e.g. 20% off 9999 is precisely 7999.2: flooring the 80% owed gives
  // 7999, never more than advertised; flooring the 20% discount would give
  // 8000, which is more).
  const rawFinalCents =
    discount.type === "PERCENTAGE"
      ? Math.floor((priceCents * (100 - discount.percent)) / 100)
      : priceCents - Math.max(discount.amountCents, 0);

  const finalPriceCents = Math.min(priceCents, Math.max(rawFinalCents, MIN_PROMOTION_FINAL_PRICE_CENTS));
  const discountAmountCents = priceCents - finalPriceCents;

  return { originalPriceCents: priceCents, discountAmountCents, finalPriceCents };
}
