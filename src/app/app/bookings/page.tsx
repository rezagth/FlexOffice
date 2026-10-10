import { requirePageAuth } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { ButtonLink } from "@/components/ui/button";
import { RaiseDisputeButton } from "@/components/dashboard/raise-dispute-button";
import { CancelBookingButton } from "@/components/dashboard/cancel-booking-button";
import { BOOKING_STATUS_LABELS, formatCents, formatDateTime } from "@/lib/format";
import { cancellationWindowLabel, clientCancellationRefund } from "@/lib/cancellation-policy";
import { ReviewForm } from "@/components/reviews/review-form";
import { StarRating } from "@/components/reviews/star-rating";
import { reviewEligibility } from "@/server/domains/reviews/reviews";

export const dynamic = "force-dynamic";

// A booking may be disputed once it is past the pure request stage — not
// PENDING (nothing has happened yet to disagree about) and not CANCELLED
// (no active engagement left to dispute).
const DISPUTABLE_STATUSES = new Set(["CONFIRMED", "COMPLETED", "REJECTED"]);

const DISPUTE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Litige signalé",
  INVESTIGATING: "Litige en cours d'examen",
  RESOLVED_REFUND: "Litige résolu — remboursé",
  RESOLVED_NO_ACTION: "Litige résolu — sans action",
  ESCALATED: "Litige escaladé",
};

/** What cancelling would mean for this booking, in one sentence — the same
 * policy the server applies (src/lib/cancellation-policy.ts). */
function cancellationConsequence(booking: {
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

export default async function ClientBookingsPage() {
  const ctx = await requirePageAuth();
  const bookings = await prisma.booking.findMany({
    where: { clientUserId: ctx.userId },
    include: {
      space: true,
      disputes: { orderBy: { createdAt: "desc" }, take: 1 },
      review: { select: { rating: true } },
    },
    orderBy: { startsAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Mes réservations</h1>

      {bookings.length === 0 ? (
        <EmptyState
          title="Aucune réservation pour l'instant"
          description="Recherchez un espace pour créer votre première réservation."
          action={
            <ButtonLink href="/search" size="sm">
              Rechercher un espace
            </ButtonLink>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {bookings.map((booking) => (
            <Card key={booking.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{booking.space.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(booking.startsAt)} → {formatDateTime(booking.endsAt)}
                </p>
                {booking.status === "CONFIRMED" && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {booking.space.address}, {booking.space.postalCode} {booking.space.city}
                    {booking.space.accessInstructions
                      ? ` · ${booking.space.accessInstructions}`
                      : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 text-right">
                <div>
                  <p className="text-sm font-medium">{formatCents(booking.priceAmountCents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                  </p>
                </div>
                {(() => {
                  const consequence = cancellationConsequence(booking);
                  return consequence ? (
                    <CancelBookingButton
                      endpoint={`/api/bookings/${booking.id}/cancel`}
                      consequence={consequence}
                      label={booking.status === "CONFIRMED" ? "Annuler la réservation" : "Annuler la demande"}
                    />
                  ) : null;
                })()}
                {booking.review ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    Votre avis : <StarRating value={booking.review.rating} />
                    <span className="sr-only">{booking.review.rating} sur 5</span>
                  </p>
                ) : (
                  reviewEligibility(booking) === "ELIGIBLE" && (
                    <ReviewForm bookingId={booking.id} spaceName={booking.space.name} />
                  )
                )}
                {booking.disputes[0] ? (
                  <p className="text-xs font-medium text-primary">
                    {DISPUTE_STATUS_LABELS[booking.disputes[0].status] ?? booking.disputes[0].status}
                  </p>
                ) : (
                  DISPUTABLE_STATUSES.has(booking.status) && (
                    <RaiseDisputeButton bookingId={booking.id} />
                  )
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
