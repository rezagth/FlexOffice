import { requirePageAdmin } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { DisputeReviewActions } from "@/components/dashboard/dispute-review-actions";
import { formatDateTime } from "@/lib/format";

const DISPUTE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Signalé",
  INVESTIGATING: "En cours d'examen",
  RESOLVED_REFUND: "Résolu — remboursé",
  RESOLVED_NO_ACTION: "Résolu — sans action",
  ESCALATED: "Escaladé",
};

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
        Signalement → prise en charge → remboursement ou clôture sans action.
        Chaque changement de statut est tracé (voir DisputeEvent).
      </p>

      {disputes.length === 0 ? (
        <EmptyState
          title="Aucun litige pour l'instant"
          description="Les signalements de clients ou d'entreprises apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {disputes.map((dispute) => (
            <Card key={dispute.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{dispute.booking.space.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Signalé par {dispute.raisedBy.name} · {formatDateTime(dispute.createdAt)}
                  </p>
                  <p className="mt-1 text-sm text-foreground">{dispute.description}</p>
                </div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {DISPUTE_STATUS_LABELS[dispute.status] ?? dispute.status}
                </p>
              </div>
              <DisputeReviewActions disputeId={dispute.id} status={dispute.status} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
