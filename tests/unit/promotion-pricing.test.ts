import { describe, expect, it } from "vitest";
import {
  applyPromotionDiscount,
  MAX_PROMOTION_DISCOUNT_PERCENT,
  MIN_PROMOTION_FINAL_PRICE_CENTS,
} from "@/server/domains/promotions/pricing";

/**
 * PRD V1.1, R34-R39, R48-R52 — the discount is borne by the partner, and the
 * platform's commission (computeCommissionCents, payments/constants.ts) is
 * computed on whatever this function returns as finalPriceCents, unchanged.
 * So every invariant this function fails to hold leaks straight into the
 * platform's own revenue, not just the client's bill.
 */
describe("applyPromotionDiscount", () => {
  it("returns the price unchanged with no discount", () => {
    expect(applyPromotionDiscount(10000, null)).toEqual({
      originalPriceCents: 10000,
      discountAmountCents: 0,
      finalPriceCents: 10000,
    });
  });

  it("applies a percentage discount, rounding the price owed down (never the discount)", () => {
    // 10000 * 15% = 1500 exactly.
    expect(applyPromotionDiscount(10000, { type: "PERCENTAGE", percent: 15 })).toEqual({
      originalPriceCents: 10000,
      discountAmountCents: 1500,
      finalPriceCents: 8500,
    });
    // 20% off 9999 is precisely 7999.2 owed: floors to 7999, never charging
    // more than advertised (flooring the discount instead would give 8000,
    // which is MORE than 7999.2).
    expect(applyPromotionDiscount(9999, { type: "PERCENTAGE", percent: 20 })).toEqual({
      originalPriceCents: 9999,
      discountAmountCents: 2000,
      finalPriceCents: 7999,
    });
  });

  it("applies a fixed-amount discount directly", () => {
    expect(applyPromotionDiscount(10000, { type: "FIXED_AMOUNT", amountCents: 2000 })).toEqual({
      originalPriceCents: 10000,
      discountAmountCents: 2000,
      finalPriceCents: 8000,
    });
  });

  it("never produces a negative final price: a fixed discount larger than the price is capped", () => {
    const result = applyPromotionDiscount(500, { type: "FIXED_AMOUNT", amountCents: 100_000 });
    expect(result.finalPriceCents).toBeGreaterThanOrEqual(0);
    expect(result.finalPriceCents).toBe(MIN_PROMOTION_FINAL_PRICE_CENTS < 500 ? MIN_PROMOTION_FINAL_PRICE_CENTS : 500);
    expect(result.discountAmountCents).toBe(result.originalPriceCents - result.finalPriceCents);
  });

  it("never discounts below the price floor, even at the maximum allowed percentage", () => {
    const result = applyPromotionDiscount(150, { type: "PERCENTAGE", percent: MAX_PROMOTION_DISCOUNT_PERCENT });
    expect(result.finalPriceCents).toBeGreaterThanOrEqual(MIN_PROMOTION_FINAL_PRICE_CENTS);
  });

  it("never discounts past the original price when the price is already under the floor", () => {
    // Below MIN_PROMOTION_FINAL_PRICE_CENTS — the floor clamp alone would
    // push the "discounted" price above the original; the outer min() must
    // win, so the result is never worse than no discount at all.
    const result = applyPromotionDiscount(50, { type: "PERCENTAGE", percent: 50 });
    expect(result.finalPriceCents).toBeLessThanOrEqual(50);
    expect(result.discountAmountCents).toBeGreaterThanOrEqual(0);
  });

  it("original always equals final plus discount — derived, never separately rounded", () => {
    for (const price of [0, 1, 99, 100, 101, 9999, 10000, 123456]) {
      for (const discount of [
        null,
        { type: "PERCENTAGE" as const, percent: 1 },
        { type: "PERCENTAGE" as const, percent: 50 },
        { type: "PERCENTAGE" as const, percent: MAX_PROMOTION_DISCOUNT_PERCENT },
        { type: "FIXED_AMOUNT" as const, amountCents: 1 },
        { type: "FIXED_AMOUNT" as const, amountCents: 5000 },
      ]) {
        const result = applyPromotionDiscount(price, discount);
        expect(result.originalPriceCents).toBe(result.finalPriceCents + result.discountAmountCents);
        expect(result.discountAmountCents).toBeGreaterThanOrEqual(0);
        expect(result.finalPriceCents).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("rejects a non-integer or negative price", () => {
    expect(() => applyPromotionDiscount(10.5, null)).toThrow();
    expect(() => applyPromotionDiscount(-1, null)).toThrow();
  });
});
