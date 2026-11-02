import { formatCents } from "@/lib/format";
import { cancellationWindowLabel, clientCancellationRefund } from "@/lib/cancellation-policy";

/** What cancelling would mean for this booking, in one sentence — the same
 * policy the server applies (src/lib/cancellation-policy.ts). */
export function cancellationConsequence(booking: {
  status: string;
  priceAmountCents: number;
  commissionAmountCents: number;
  cancellationWindowHours: number;
  startsAt: Date;
}): string | null {
  if (booking.startsAt.getTime() <= Date.now()) return null;
  if (booking.status === "AWAITING_PAYMENT" || booking.status === "PENDING") {
    return "La demande sera annulée sans frais : rien ne vous a été débité.";
  }
  if (booking.status !== "CONFIRMED") return null;
  const { tier, refundCents } = clientCancellationRefund(booking);
  const label = cancellationWindowLabel(booking.cancellationWindowHours);
  return `Vous serez remboursé de ${formatCents(refundCents)} (${
    tier === "FULL"
      ? label
        ? `plus de ${label} avant le début`
        : "annulation sans délai"
      : `moins de ${label} avant le début : 50 % du prix`
  }). Les frais de service ne sont pas remboursables.`;
}
