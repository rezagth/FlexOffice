import Link from "next/link";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import type { BookingStatus } from "@/generated/prisma/client";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { BookingRequestActions } from "@/components/dashboard/booking-request-actions";
import { RaiseDisputeButton } from "@/components/dashboard/raise-dispute-button";
import { CancelBookingButton } from "@/components/dashboard/cancel-booking-button";
import { BOOKING_STATUS_LABELS, formatCents, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// A booking may be disputed once it is past the pure request stage — same
// rule as the client's own bookings page (src/app/app/bookings/page.tsx).
const DISPUTABLE_STATUSES: readonly BookingStatus[] = ["CONFIRMED", "COMPLETED", "REJECTED"];

const DISPUTE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Litige signalé",
  INVESTIGATING: "Litige en cours d'examen",
  RESOLVED_REFUND: "Litige résolu — remboursé",
  RESOLVED_NO_ACTION: "Litige résolu — sans action",
  ESCALATED: "Litige escaladé",
};

/** A confirmed booking whose slot has not started can still be cancelled. */
/** A slot that has begun is no longer "à venir". */
function hasStarted(startsAt: Date): boolean {
  return startsAt.getTime() <= Date.now();
}

function canLandlordCancel(booking: { status: string; startsAt: Date }): boolean {
  return booking.status === "CONFIRMED" && booking.startsAt.getTime() > Date.now();
}

export default async function PartnerRequestsPage() {
  const ctx = await requirePageLandlordOrg("landlord:manage_bookings");
  const [requests, handled] = await Promise.all([
    prisma.booking.findMany({
      where: { organizationId: ctx.activeOrgId, status: "PENDING" },
      include: { space: true, clientUser: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.booking.findMany({
      // CANCELLED shown too (not disputable): a landlord must see that a
      // confirmed booking was cancelled by the client.
      // `cancelledBy` is NULL on every booking that was never cancelled: the
      // NULL case is spelled out rather than left to how a bare NOT treats it.
      where: {
        organizationId: ctx.activeOrgId,
        status: { in: [...DISPUTABLE_STATUSES, "CANCELLED"] },
        OR: [{ cancelledBy: null }, { cancelledBy: { not: "SYSTEM" } }],
      },
      include: {
        space: true,
        clientUser: { select: { name: true } },
        disputes: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { startsAt: "desc" },
      take: 50,
    }),
  ]);

  const upcoming = handled
    .filter((b) => b.status === "CONFIRMED" && !hasStarted(b.startsAt))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const history = handled.filter((b) => !upcoming.includes(b));

  const renderBooking = (booking: (typeof handled)[number]) => (
              <Card key={booking.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link href={`/app/landlord/bookings/${booking.id}`} className="font-medium underline-offset-2 hover:underline">
                    {booking.clientUser.name} — {booking.space.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(booking.startsAt)} → {formatDateTime(booking.endsAt)} ·{" "}
                    {formatCents(booking.priceAmountCents)} ·{" "}
                    {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                {canLandlordCancel(booking) && (
                  <CancelBookingButton
                    endpoint={`/api/partner/bookings/${booking.id}/cancel`}
                    consequence={`Le client sera remboursé intégralement (${formatCents(booking.priceAmountCents)}) et le montant qui vous a été versé sera repris. À réserver aux cas de force majeure.`}
                  />
                )}
                {booking.disputes[0] ? (
                  <p className="text-sm font-medium text-primary">
                    {DISPUTE_STATUS_LABELS[booking.disputes[0].status] ?? booking.disputes[0].status}
                  </p>
                ) : (
                  DISPUTABLE_STATUSES.includes(booking.status) && (
                    <RaiseDisputeButton bookingId={booking.id} />
                  )
                )}
                </div>
              </Card>
            
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-foreground">Demandes de réservation</h1>

        {requests.length === 0 ? (
          <EmptyState
            title="Aucune demande en attente"
            description="Les nouvelles demandes de réservation de vos espaces apparaîtront ici."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {requests.map((booking) => (
              <Card key={booking.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link href={`/app/landlord/bookings/${booking.id}`} className="font-medium underline-offset-2 hover:underline">
                    {booking.clientUser.name} — {booking.space.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(booking.startsAt)} → {formatDateTime(booking.endsAt)} ·{" "}
                    {booking.participantsCount} pers. · {formatCents(booking.priceAmountCents)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{booking.purpose}</p>
                </div>
                <BookingRequestActions bookingId={booking.id} />
              </Card>
            ))}
          </div>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Réservations à venir</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Les réservations confirmées à venir apparaîtront ici.</p>
        ) : (
          <div className="flex flex-col gap-3">{upcoming.map(renderBooking)}</div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Historique</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Les réservations terminées, refusées ou annulées apparaîtront ici.
          </p>
        ) : (
          <div className="flex flex-col gap-3">{history.map(renderBooking)}</div>
        )}
      </section>
    </div>
  );
}
