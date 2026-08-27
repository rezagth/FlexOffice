import { getAuthContext } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { ButtonLink } from "@/components/ui/button";
import { formatCents, formatDateTime } from "@/lib/format";

export default async function ClientBookingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null; // layout already redirects unauthenticated users; this guards the brief render race before that redirect completes
  const bookings = await prisma.booking.findMany({
    where: { clientUserId: ctx.userId },
    include: { space: true },
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
            <Card key={booking.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{booking.space.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(booking.startsAt)} → {formatDateTime(booking.endsAt)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{formatCents(booking.priceAmountCents)}</p>
                <p className="text-xs text-muted-foreground">{booking.status}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
