import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import type { BookingStatus } from "@/generated/prisma/client";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { BookingRequestActions } from "@/components/dashboard/booking-request-actions";
import { RaiseDisputeButton } from "@/components/dashboard/raise-dispute-button";
import { formatCents, formatDateTime } from "@/lib/format";

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

export default async function PartnerRequestsPage() {
  const ctx = await requirePageLandlordOrg("landlord:manage_bookings");
  const [requests, handled] = await Promise.all([
    prisma.booking.findMany({
      where: { organizationId: ctx.activeOrgId, status: "PENDING" },
      include: { space: true, clientUser: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.booking.findMany({
      where: { organizationId: ctx.activeOrgId, status: { in: [...DISPUTABLE_STATUSES] } },
      include: {
        space: true,
        clientUser: { select: { name: true } },
        disputes: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { startsAt: "desc" },
      take: 50,
    }),
  ]);

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
                  <p className="font-medium">
                    {booking.clientUser.name} — {booking.space.name}
                  </p>
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
        <h2 className="text-lg font-medium">Réservations passées</h2>
        {handled.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Les réservations acceptées, refusées ou terminées apparaîtront ici.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {handled.map((booking) => (
              <Card key={booking.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">
                    {booking.clientUser.name} — {booking.space.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(booking.startsAt)} → {formatDateTime(booking.endsAt)} ·{" "}
                    {formatCents(booking.priceAmountCents)}
                  </p>
                </div>
                {booking.disputes[0] ? (
                  <p className="text-sm font-medium text-primary">
                    {DISPUTE_STATUS_LABELS[booking.disputes[0].status] ?? booking.disputes[0].status}
                  </p>
                ) : (
                  DISPUTABLE_STATUSES.includes(booking.status) && (
                    <RaiseDisputeButton bookingId={booking.id} />
                  )
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
