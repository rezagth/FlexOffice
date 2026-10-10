/**
 * VAT maths on integer cents. Prices are VAT included (assumption H1), so
 * the tax is extracted from the gross amount:
 *
 *   net (HT) = round(gross × 10000 / (10000 + rate_bp))   half-up
 *   vat      = gross − net                                  never rounded apart
 *
 * Deriving the VAT as the difference guarantees HT + TVA = TTC to the cent,
 * which a separate rounding of each part would not. No floating point
 * touches an amount: the division is done on integers with an explicit
 * half-up rule.
 */
export type VatBreakdown = {
  totalCents: number;
  netCents: number;
  vatCents: number;
  vatRateBasisPoints: number;
  vatExempt: boolean;
};

export function splitGross(grossCents: number, vatRateBasisPoints: number): VatBreakdown {
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new Error("splitGross: gross amount must be a non-negative integer number of cents");
  }
  if (!Number.isInteger(vatRateBasisPoints) || vatRateBasisPoints < 0 || vatRateBasisPoints > 10000) {
    throw new Error("splitGross: VAT rate must be an integer number of basis points in [0, 10000]");
  }
  const divisor = 10000 + vatRateBasisPoints;
  // floor((2·a·10000 + d) / (2·d)) = round-half-up(a·10000 / d), integers only.
  const netCents = Math.floor((2 * grossCents * 10000 + divisor) / (2 * divisor));
  return {
    totalCents: grossCents,
    netCents,
    vatCents: grossCents - netCents,
    vatRateBasisPoints,
    vatExempt: false,
  };
}

/** No VAT collected: the whole amount is net, with the exemption mention
 * printed on the document. */
export function exemptAmount(grossCents: number): VatBreakdown {
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new Error("exemptAmount: amount must be a non-negative integer number of cents");
  }
  return { totalCents: grossCents, netCents: grossCents, vatCents: 0, vatRateBasisPoints: 0, vatExempt: true };
}

/** VAT of a booking invoice: the landlord's regime (H1). */
export function rentalVat(grossCents: number, landlordVatNumber: string | null | undefined, rateBp: number): VatBreakdown {
  return landlordVatNumber?.trim() ? splitGross(grossCents, rateBp) : exemptAmount(grossCents);
}

/** "20 %", "5,5 %" */
export function formatVatRate(basisPoints: number): string {
  const percent = basisPoints / 100;
  return `${percent.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
}
