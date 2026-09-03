import { requirePageAdmin } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { formatDateTime } from "@/lib/format";

export default async function AdminDisputesPage() {
  await requirePageAdmin();
  const disputes = await prisma.dispute.findMany({
    include: { booking: { include: { space: true } }, raisedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Litiges</h1>
      <p className="max-w-lg text-sm text-muted-foreground">
        Le processus signalement → enquête → remboursement/sanction arrive dans une
        prochaine itération. Le modèle de données trace déjà chaque changement de
        statut (voir DisputeEvent).
      </p>

      {disputes.length === 0 ? (
        <EmptyState
          title="Aucun litige pour l'instant"
          description="Les signalements de clients ou d'entreprises apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {disputes.map((dispute) => (
            <Card key={dispute.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{dispute.booking.space.name}</p>
                <p className="text-sm text-muted-foreground">
                  Signalé par {dispute.raisedBy.name} · {formatDateTime(dispute.createdAt)}
                </p>
              </div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {dispute.status}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
