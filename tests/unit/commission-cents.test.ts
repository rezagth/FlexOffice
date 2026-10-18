import { describe, expect, it } from "vitest";
import { COMMISSION_RATE, computeCommissionCents } from "@/server/domains/payments/constants";

/** PRD V1.1, R65 — the platform's own cut, computed server-side from the
 * space's own price (create-booking.ts), never a client-supplied value. */
describe("computeCommissionCents", () => {
  it("is 15% of the price, the cahier des charges' reference rate", () => {
    expect(COMMISSION_RATE).toBe(0.15);
    expect(computeCommissionCents(9000)).toBe(1350);
  });

  it("is 0 for a 0-cent price", () => {
    expect(computeCommissionCents(0)).toBe(0);
  });

  it("rounds down below the half-cent (1 cent * 15% = 0.15 -> 0)", () => {
    expect(computeCommissionCents(1)).toBe(0);
  });

  it("rounds a half-cent tie up, same rule as Math.round for positive numbers", () => {
    // 10 * 0.15 = 1.5 exactly.
    expect(computeCommissionCents(10)).toBe(2);
  });

  it("rounds an ordinary fractional result to the nearest cent", () => {
    // 3 * 0.15 = 0.45 -> 0 ; 7 * 0.15 = 1.05 -> 1.
    expect(computeCommissionCents(3)).toBe(0);
    expect(computeCommissionCents(7)).toBe(1);
  });

  it("scales correctly for a full-day price in the thousands of cents", () => {
    expect(computeCommissionCents(15000)).toBe(2250); // a 150€ day rate
    expect(computeCommissionCents(30000)).toBe(4500);
  });
});
