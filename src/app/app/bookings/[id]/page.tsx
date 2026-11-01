import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePageAuth } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { BookingTimeline } from "@/components/dashboard/booking-timeline";
import { DetailList } from "@/components/dashboard/detail-list";
import { RaiseDisputeButton } from "@/components/dashboard/raise-dispute-button";
import { CancelBookingButton } from "@/components/dashboard/cancel-booking-button";
import { ReviewForm } from "@/components/reviews/review-form";
import { StarRating } from "@/components/reviews/star-rating";
import { reviewEligibility } from "@/server/domains/reviews/reviews";
import { buildBookingTimeline } from "@/lib/booking-timeline";
import { cancellationConsequence } from "@/lib/booking-cancellation-text";
import { BOOKING_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatCents, formatDateTime } from "@/lib/format";

export const metadata = { title: "Détail de la réservation — MakomSpace" };
export const dynamic = "force-dynamic";

const DISPUTABLE_STATUSES = new Set(["CONFIRMED", "COMPLETED", "REJECTED"]);

const DISPUTE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Litige signalé",
  INVESTIGATING: "Litige en cours d'examen",
  RESOLVED_REFUND: "Litige résolu — remboursé",
  RESOLVED_NO_ACTION: "Litige résolu — sans action",
  ESCALATED: "Litige escaladé",
};

/** The tenant's own booking, in full: where it stands step by step, what was
 * agreed, what was paid, and every action available. Scoped by the session's
 * user id — knowing the booking id gives no right to see it. */
export default async function ClientBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageAuth({ redirectTo: "/app/bookings" });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const booking = await prisma.booking.findFirst({
    where: { id, clientUserId: ctx.userId },
    include: {
      space: true,
      organization: { select: { name: true } },
      payment: { include: { refunds: { orderBy: { createdAt: "asc" } }, invoice: { select: { id: true } } } },
      disputes: { orderBy: { createdAt: "desc" }, take: 1 },
      review: { select: { rating: true } },
    },
  });
  if (!booking) notFound();

  const timeline = buildBookingTimeline({
    viewer: "client",
    now: new Date(),
    booking,
    payment: booking.payment,
    refunds: booking.payment?.refunds ?? [],
    payoutLine: null,
    hasReview: booking.review !== null,
  });
  const consequence = cancellationConsequence(booking);
  const confirmed = booking.status === "CONFIRMED";
  const dispute = booking.disputes[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/bookings" className="text-sm text-muted-foreground underline underline-offset-2">
          ← Mes réservations
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{booking.space.name}</h1>
            <p className="text-sm text-muted-foreground">
              Réservation n° {booking.id.slice(0, 8).toUpperCase()} · proposée par {booking.organization.name}
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground">
            {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
          </span>
        </div>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Suivi</h2>
        <BookingTimeline events={timeline} />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Votre réservation</h2>
        <DetailList
          items={[
            { label: "Début", value: formatDateTime(booking.startsAt) },
            { label: "Fin", value: formatDateTime(booking.endsAt) },
            { label: "Participants", value: `${booking.participantsCount} personne${booking.participantsCount > 1 ? "s" : ""}` },
            { label: "Objet", value: booking.purpose },
            {
              label: "Adresse",
              value: confirmed ? (
                `${booking.space.address}, ${booking.space.postalCode} ${booking.space.city}`
              ) : (
                <span className="font-normal text-muted-foreground">Communiquée à la confirmation ({booking.space.city})</span>
              ),
            },
            ...(confirmed && booking.space.accessInstructions
              ? [{ label: "Accès", value: booking.space.accessInstructions }]
              : []),
          ]}
        />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Paiement</h2>
        <DetailList
          items={[
            ...(booking.discountAmountCents > 0
              ? [
                  { label: "Prix avant remise", value: formatCents(booking.originalPriceAmountCents) },
                  { label: "Remise", value: `− ${formatCents(booking.discountAmountCents)}` },
                ]
              : []),
            { label: "Total", value: formatCents(booking.priceAmountCents) },
            {
              label: "État du paiement",
              value: booking.payment ? (PAYMENT_STATUS_LABELS[booking.payment.status] ?? booking.payment.status) : "—",
            },
            ...(booking.payment?.refunds ?? []).map((refund, index) => ({
              label: `Remboursement${(booking.payment?.refunds.length ?? 0) > 1 ? ` ${index + 1}` : ""}`,
              value: formatCents(refund.amountCents),
            })),
          ]}
        />
        {booking.payment?.invoice && (
          <Link href={`/app/invoices/${booking.payment.id}`} className="text-sm font-medium underline underline-offset-2">
            Voir la facture
          </Link>
        )}
      </Card>

      {consequence && (
        <Card className="flex flex-col gap-2 p-5">
          <h2 className="text-lg font-medium">Annulation</h2>
          <p className="text-sm text-muted-foreground">{consequence}</p>
        </Card>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <ButtonLink href={`/app/messages/${booking.id}`} variant="outline" size="sm">
          Écrire à l&apos;hôte
        </ButtonLink>
        {consequence && (
          <CancelBookingButton
            endpoint={`/api/bookings/${booking.id}/cancel`}
            consequence={consequence}
            label={confirmed ? "Annuler la réservation" : "Annuler la demande"}
          />
        )}
        {booking.review ? (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            Votre avis : <StarRating value={booking.review.rating} />
            <span className="sr-only">{booking.review.rating} sur 5</span>
          </p>
        ) : (
          reviewEligibility(booking) === "ELIGIBLE" && <ReviewForm bookingId={booking.id} spaceName={booking.space.name} />
        )}
        {dispute ? (
          <p className="text-sm font-medium text-primary">{DISPUTE_STATUS_LABELS[dispute.status] ?? dispute.status}</p>
        ) : (
          DISPUTABLE_STATUSES.has(booking.status) && <RaiseDisputeButton bookingId={booking.id} />
        )}
      </div>
    </div>
  );
}
