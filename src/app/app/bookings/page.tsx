import { requirePageAuth } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { ButtonLink } from "@/components/ui/button";
import { RaiseDisputeButton } from "@/components/dashboard/raise-dispute-button";
import { BOOKING_STATUS_LABELS, formatCents, formatDateTime } from "@/lib/format";

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

export default async function ClientBookingsPage() {
  const ctx = await requirePageAuth();
  const bookings = await prisma.booking.findMany({
    where: { clientUserId: ctx.userId },
    include: {
      space: true,
      disputes: { orderBy: { createdAt: "desc" }, take: 1 },
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
