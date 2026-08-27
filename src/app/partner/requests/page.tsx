import { getAuthContext } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { formatDateTime } from "@/lib/format";

export default async function PartnerRequestsPage() {
  const ctx = await getAuthContext();
  if (!ctx?.organizationId) return null; // layout already redirects non-PARTNER; this guards the brief render race before that redirect completes
  const requests = await prisma.booking.findMany({
    where: { organizationId: ctx.organizationId, status: "PENDING" },
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
            <Card key={booking.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">
                  {booking.clientUser.name} — {booking.space.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(booking.startsAt)} · {booking.participantsCount} pers.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Accepter / refuser à venir
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
