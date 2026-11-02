import { describe, expect, it } from "vitest";
import {
  applyPromotionDiscount,
  MAX_PROMOTION_DISCOUNT_PERCENT,
  MIN_PROMOTION_FINAL_PRICE_CENTS,
  type PromotionDiscount,
} from "@/server/domains/promotions/pricing";

/**
 * Propriétés qui doivent tenir pour TOUT prix et TOUTE remise : on balaie une
 * grille dense de valeurs (y compris les cas limites) plutôt que quelques
 * exemples choisis à la main.
 */
const PRICES = [0, 1, 99, 100, 101, 199, 500, 999, 1000, 9999, 10000, 12345, 99999, 1_000_000];
const PERCENTS = [0, 1, 5, 10, 20, 33, 50, 75, 90];
const AMOUNTS = [0, 1, 50, 99, 100, 500, 1000, 5000, 100000, 10_000_000];

const discounts: PromotionDiscount[] = [
  ...PERCENTS.map((percent) => ({ type: "PERCENTAGE" as const, percent })),
  ...AMOUNTS.map((amountCents) => ({ type: "FIXED_AMOUNT" as const, amountCents })),
];

describe("applyPromotionDiscount — invariants sur une grille de valeurs", () => {
  for (const price of PRICES) {
    for (const discount of discounts) {
      const label = `${price} c, ${discount.type === "PERCENTAGE" ? `${discount.percent} %` : `-${discount.amountCents} c`}`;
      it(label, () => {
        const r = applyPromotionDiscount(price, discount);
        expect(Number.isInteger(r.finalPriceCents)).toBe(true);
        expect(Number.isInteger(r.discountAmountCents)).toBe(true);
        expect(r.originalPriceCents).toBe(price);
        // La remise et le prix final se somment au centime près au prix d'origine.
        expect(r.discountAmountCents + r.finalPriceCents).toBe(price);
        // Jamais de remise négative, jamais de prix final supérieur à l'original.
        expect(r.discountAmountCents).toBeGreaterThanOrEqual(0);
        expect(r.finalPriceCents).toBeLessThanOrEqual(price);
        // Plancher : jamais gratuit, sauf si le prix d'origine est déjà sous le plancher (alors inchangé).
        expect(r.finalPriceCents).toBeGreaterThanOrEqual(Math.min(price, MIN_PROMOTION_FINAL_PRICE_CENTS));
      });
    }
  }
});

describe("applyPromotionDiscount — cas précis", () => {
  it("sans remise : prix inchangé", () => {
    expect(applyPromotionDiscount(5000, null)).toEqual({
      originalPriceCents: 5000,
      discountAmountCents: 0,
      finalPriceCents: 5000,
    });
  });

  it("20 % de 9999 c : arrondi en faveur du client, jamais au-dessus du pourcentage annoncé", () => {
    expect(applyPromotionDiscount(9999, { type: "PERCENTAGE", percent: 20 }).finalPriceCents).toBe(7999);
  });

  it("le plafond métier est de 90 %", () => {
    expect(MAX_PROMOTION_DISCOUNT_PERCENT).toBe(90);
    expect(applyPromotionDiscount(10000, { type: "PERCENTAGE", percent: 90 }).finalPriceCents).toBe(1000);
  });

  it("une remise fixe supérieure au prix est plafonnée au plancher", () => {
    const r = applyPromotionDiscount(2000, { type: "FIXED_AMOUNT", amountCents: 5000 });
    expect(r.finalPriceCents).toBe(MIN_PROMOTION_FINAL_PRICE_CENTS);
    expect(r.discountAmountCents).toBe(2000 - MIN_PROMOTION_FINAL_PRICE_CENTS);
  });

  it("une remise fixe négative n'augmente jamais le prix", () => {
    expect(applyPromotionDiscount(5000, { type: "FIXED_AMOUNT", amountCents: -1000 }).finalPriceCents).toBe(5000);
  });

  it("une remise de 0 % ou 0 c ne change rien", () => {
    expect(applyPromotionDiscount(5000, { type: "PERCENTAGE", percent: 0 }).finalPriceCents).toBe(5000);
    expect(applyPromotionDiscount(5000, { type: "FIXED_AMOUNT", amountCents: 0 }).finalPriceCents).toBe(5000);
  });

  it.each([-1, 0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("refuse le prix invalide %s", (price) => {
    expect(() => applyPromotionDiscount(price, null)).toThrow();
  });

  it("un prix sous le plancher n'est jamais relevé par une promotion", () => {
    expect(applyPromotionDiscount(50, { type: "PERCENTAGE", percent: 10 }).finalPriceCents).toBe(50);
  });

  it("la remise est monotone : plus le pourcentage est élevé, plus le prix final baisse", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let p = 0; p <= 90; p += 5) {
      const { finalPriceCents } = applyPromotionDiscount(12345, { type: "PERCENTAGE", percent: p });
      expect(finalPriceCents).toBeLessThanOrEqual(previous);
      previous = finalPriceCents;
    }
  });
});
