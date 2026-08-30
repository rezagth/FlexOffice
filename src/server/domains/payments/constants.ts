/** Platform commission on every booking. Cahier des charges: 15–25%,
 * reference example retained at 15%. Server-side constant only — never a
 * request parameter. */
export const COMMISSION_RATE = 0.15;

export function computeCommissionCents(priceAmountCents: number): number {
  return Math.round(priceAmountCents * COMMISSION_RATE);
}
