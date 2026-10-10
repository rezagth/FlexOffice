/**
 * Cancellation policy — rules decided with the product owner on 10/10/2026
 * (they replace the fixed 48 h / 24 h tiers of 06/10/2026).
 * Isomorphic (no server import): the pages show the same refund the server
 * will issue. The server always recomputes it from the booking in the
 * database (bookings/cancel.ts); it is never trusted from a request.
 *
 * Each landlord picks a cancellation window for each space: none, 2 days,
 * 7 days or 1 month before the start of the slot. It is copied onto the
 * booking when the request is made.
 *
 * A request not yet accepted (card authorized, not charged) is always
 * cancelled for free.
 *
 * A confirmed booking cancelled by the CLIENT:
 *   - outside the window (or no window): refunded in full, except the
 *     platform's commission, which is a non-refundable service fee;
 *   - inside the window: half of the price is refunded. The platform's
 *     commission comes out of the other half, the rest goes to the landlord.
 *
 * A confirmed booking cancelled by the LANDLORD: the client is refunded in
 * full, commission included. Inside the window the landlord owes the
 * platform's commission, deducted from their next payout.
 */

/** The windows a landlord can choose from, in hours before the start. */
export const CANCELLATION_WINDOW_OPTIONS = [
  { hours: 0, label: "Aucun délai", description: "Annulation gratuite jusqu'au début du créneau (hors frais de service)" },
  { hours: 48, label: "2 jours", description: "À moins de 2 jours du début, 50 % seulement sont remboursés" },
  { hours: 168, label: "7 jours", description: "À moins de 7 jours du début, 50 % seulement sont remboursés" },
  { hours: 720, label: "1 mois", description: "À moins d'un mois du début, 50 % seulement sont remboursés" },
] as const;

export const CANCELLATION_WINDOW_HOURS: number[] = CANCELLATION_WINDOW_OPTIONS.map((option) => option.hours);
export const DEFAULT_CANCELLATION_WINDOW_HOURS = 48;
/** Share of the price refunded to a client who cancels inside the window. */
export const INSIDE_WINDOW_REFUND_PERCENT = 50;

export type CancellationTier = "FULL" | "PARTIAL";

export function isCancellationWindowHours(value: number): boolean {
  return CANCELLATION_WINDOW_HOURS.includes(value);
}

/** "2 jours", "7 jours", "1 mois"… or null when there is no window. */
export function cancellationWindowLabel(hours: number): string | null {
  if (hours <= 0) return null;
  const option = CANCELLATION_WINDOW_OPTIONS.find((o) => o.hours === hours);
  if (option) return option.label;
  return hours % 24 === 0 ? `${hours / 24} jours` : `${hours} h`;
}

/** Whether `now` is inside the cancellation window of a slot starting at
 * `startsAt`. With no window (0) it never is. */
export function isInsideCancellationWindow(params: {
  startsAt: Date;
  cancellationWindowHours: number;
  now?: Date;
}): boolean {
  if (params.cancellationWindowHours <= 0) return false;
  const now = params.now ?? new Date();
  const hoursBeforeStart = (params.startsAt.getTime() - now.getTime()) / 3_600_000;
  return hoursBeforeStart <= params.cancellationWindowHours;
}

export function clientCancellationRefund(params: {
  priceAmountCents: number;
  commissionAmountCents: number;
  startsAt: Date;
  cancellationWindowHours: number;
  now?: Date;
}): { tier: CancellationTier; refundCents: number } {
  if (!isInsideCancellationWindow(params)) {
    return { tier: "FULL", refundCents: params.priceAmountCents - params.commissionAmountCents };
  }
  const half = Math.floor((params.priceAmountCents * INSIDE_WINDOW_REFUND_PERCENT) / 100);
  // The platform's commission is never refunded: if it were ever more than
  // half of the price, the refund shrinks accordingly.
  return { tier: "PARTIAL", refundCents: Math.min(half, params.priceAmountCents - params.commissionAmountCents) };
}

/** What a landlord who cancels inside the window owes the platform: the
 * commission it gave up by refunding the client in full. */
export function landlordCancellationPenaltyCents(params: {
  commissionAmountCents: number;
  startsAt: Date;
  cancellationWindowHours: number;
  now?: Date;
}): number {
  return isInsideCancellationWindow(params) ? params.commissionAmountCents : 0;
}

/** The cancellation terms of a space, as lines of text for the public page
 * and the booking recap. */
export function cancellationPolicyLines(cancellationWindowHours: number): string[] {
  const lines = ["Annulation gratuite tant que l'entreprise n'a pas accepté votre demande."];
  const label = cancellationWindowLabel(cancellationWindowHours);
  if (!label) {
    lines.push("Une fois la réservation confirmée : annulation possible jusqu'au début du créneau, avec remboursement du prix hors frais de service.");
  } else {
    lines.push(
      `Plus de ${label} avant le début : la location est remboursée, hors frais de service.`,
      `À moins de ${label} du début : ${INSIDE_WINDOW_REFUND_PERCENT} % du prix est remboursé.`
    );
  }
  lines.push(
    "Les frais de service MakomSpace ne sont pas remboursables, sauf annulation par l'entreprise : dans ce cas, vous êtes remboursé à 100 %."
  );
  return lines;
}
