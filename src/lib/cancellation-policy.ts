/**
 * Client cancellation policy — decided with the product owner on 06/10/2026.
 * Isomorphic (no server import): the client bookings page shows the same
 * refund the server will issue. The server always recomputes it from the
 * booking in the database (bookings/cancel.ts); this is never trusted from
 * a request.
 *
 * For a CONFIRMED booking cancelled by the client:
 *   - more than 48 h before the start: the landlord's share is refunded in full;
 *   - between 48 h and 24 h: half of the landlord's share is refunded;
 *   - less than 24 h: nothing is refunded.
 * The platform's commission is a non-refundable service fee in every case.
 *
 * A request not yet accepted (card authorized, not charged) is always
 * cancelled for free. A landlord cancelling a confirmed booking refunds
 * the client in full, commission included (bookings/cancel.ts).
 */
export const FULL_REFUND_MIN_HOURS = 48;
export const PARTIAL_REFUND_MIN_HOURS = 24;
export const PARTIAL_REFUND_PERCENT = 50;

export type CancellationTier = "FULL" | "PARTIAL" | "NONE";

export function clientCancellationRefund(params: {
  priceAmountCents: number;
  commissionAmountCents: number;
  startsAt: Date;
  now?: Date;
}): { tier: CancellationTier; refundCents: number } {
  const now = params.now ?? new Date();
  const hoursBeforeStart = (params.startsAt.getTime() - now.getTime()) / 3_600_000;
  const landlordShare = params.priceAmountCents - params.commissionAmountCents;

  if (hoursBeforeStart > FULL_REFUND_MIN_HOURS) return { tier: "FULL", refundCents: landlordShare };
  if (hoursBeforeStart > PARTIAL_REFUND_MIN_HOURS) {
    return { tier: "PARTIAL", refundCents: Math.floor((landlordShare * PARTIAL_REFUND_PERCENT) / 100) };
  }
  return { tier: "NONE", refundCents: 0 };
}
