import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { BookingRequestActions } from "@/components/dashboard/booking-request-actions";
import { formatCents, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PartnerRequestsPage() {
  const ctx = await requirePageLandlordOrg("landlord:manage_bookings");
  const requests = await prisma.booking.findMany({
    where: { organizationId: ctx.activeOrgId, status: "PENDING" },
    include: { space: true, clientUser: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
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
  );
}
