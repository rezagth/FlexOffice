import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { BookingTimeline } from "@/components/dashboard/booking-timeline";
import { DetailList } from "@/components/dashboard/detail-list";
import { BookingRequestActions } from "@/components/dashboard/booking-request-actions";
import { RaiseDisputeButton } from "@/components/dashboard/raise-dispute-button";
import { CancelBookingButton } from "@/components/dashboard/cancel-booking-button";
import { buildBookingTimeline } from "@/lib/booking-timeline";
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

/** A booking whose slot has begun can no longer be cancelled by the landlord. */
function hasStarted(startsAt: Date): boolean {
  return startsAt.getTime() <= Date.now();
}

/** A booking on one of the organization's spaces, in full. Scoped by the
 * session's active organization — a booking id from another organization is a
 * 404, never a view. Amounts follow the revenue capability: a member who may
 * manage bookings but not see revenue gets no figures. */
export default async function LandlordBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageLandlordOrg("landlord:manage_bookings");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const booking = await prisma.booking.findFirst({
    where: { id, organizationId: ctx.activeOrgId },
    include: {
      space: true,
      clientUser: { select: { name: true } },
      payment: { include: { refunds: { orderBy: { createdAt: "asc" } } } },
      disputes: { orderBy: { createdAt: "desc" }, take: 1 },
      review: { select: { rating: true } },
      payoutLines: { where: { kind: "EARNING" }, include: { payout: { select: { paidAt: true, status: true } } } },
    },
  });
  if (!booking) notFound();

  const canSeeRevenue = ctx.capabilities.has("landlord:view_revenue");
  const earning = booking.payoutLines[0] ?? null;
  const timeline = buildBookingTimeline({
    viewer: "landlord",
    now: new Date(),
    booking,
    payment: booking.payment,
    refunds: booking.payment?.refunds ?? [],
    payoutLine:
      canSeeRevenue && earning
        ? {
            eligibleAt: earning.eligibleAt,
            paidAt: earning.payout?.status === "PAID" ? earning.payout.paidAt : null,
            amountCents: earning.amountCents,
          }
        : null,
    hasReview: booking.review !== null,
  });
  const dispute = booking.disputes[0];
  const canCancel = booking.status === "CONFIRMED" && !hasStarted(booking.startsAt);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/landlord/requests" className="text-sm text-muted-foreground underline underline-offset-2">
          ← Réservations
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {booking.clientUser.name} — {booking.space.name}
            </h1>
            <p className="text-sm text-muted-foreground">Réservation n° {booking.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground">
            {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
          </span>
        </div>
      </div>

      {booking.status === "PENDING" && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-accent/40 p-4">
          <p className="text-sm font-medium text-foreground">Cette demande attend votre réponse.</p>
          <BookingRequestActions bookingId={booking.id} />
        </Card>
      )}

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Suivi</h2>
        <BookingTimeline events={timeline} />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">La réservation</h2>
        <DetailList
          items={[
            { label: "Locataire", value: booking.clientUser.name },
            { label: "Espace", value: booking.space.name },
            { label: "Début", value: formatDateTime(booking.startsAt) },
            { label: "Fin", value: formatDateTime(booking.endsAt) },
            { label: "Participants", value: `${booking.participantsCount} personne${booking.participantsCount > 1 ? "s" : ""}` },
            { label: "Objet", value: booking.purpose },
          ]}
        />
      </Card>

      {canSeeRevenue && (
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-medium">Montants</h2>
          <DetailList
            items={[
              ...(booking.discountAmountCents > 0
                ? [
                    { label: "Prix avant remise", value: formatCents(booking.originalPriceAmountCents) },
                    { label: "Remise (à votre charge)", value: `− ${formatCents(booking.discountAmountCents)}` },
                  ]
                : []),
              { label: "Payé par le locataire", value: formatCents(booking.priceAmountCents) },
              { label: "Commission MakomSpace", value: `− ${formatCents(booking.commissionAmountCents)}` },
              { label: "Pour vous", value: formatCents(booking.payment?.netAmountCents ?? booking.priceAmountCents - booking.commissionAmountCents) },
              {
                label: "État du paiement",
                value: booking.payment ? (PAYMENT_STATUS_LABELS[booking.payment.status] ?? booking.payment.status) : "—",
              },
            ]}
          />
          <Link href="/app/landlord/payouts" className="text-sm font-medium underline underline-offset-2">
            Voir mes versements
          </Link>
        </Card>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <ButtonLink href={`/app/messages/${booking.id}`} variant="outline" size="sm">
          Écrire au locataire
        </ButtonLink>
        {canCancel && (
          <CancelBookingButton
            endpoint={`/api/partner/bookings/${booking.id}/cancel`}
            consequence={`Le client sera remboursé intégralement (${formatCents(booking.priceAmountCents)}) et le montant qui vous a été versé sera repris. À réserver aux cas de force majeure.`}
          />
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
