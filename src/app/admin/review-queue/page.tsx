import { requirePageAdmin } from "@/server/auth/page-guards";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/states";
import { formatDateTime } from "@/lib/format";
import { listReviewQueue, type ReviewQueueKind } from "@/server/domains/admin/review-queue";

export const metadata = { title: "À traiter — Admin MakomSpace" };
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<ReviewQueueKind, string> = {
  verification: "Vérification",
  domiciliation: "Domiciliation",
  promotion: "Promotion",
};

/**
 * PRD V1.1, R66 — tout ce qui attend une décision admin, tous types
 * confondus, de la plus ancienne demande à la plus récente. Chaque ligne
 * renvoie vers l'écran propre à son type pour la décision elle-même : cette
 * page ne fait qu'aider à prioriser quoi traiter en premier.
 */
export default async function AdminReviewQueuePage() {
  await requirePageAdmin();
  const items = await listReviewQueue();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">À traiter</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Vérifications, domiciliations et promotions en attente d&apos;une décision, de la plus
          ancienne à la plus récente.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Rien à traiter" description="Aucune demande en attente pour l'instant." />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <Card key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-foreground">{item.organizationName}</p>
                <p className="text-sm text-muted-foreground">
                  {KIND_LABELS[item.kind]} ({item.summary}) · {formatDateTime(item.submittedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {item.overdue && (
                  <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                    En attente depuis plus de 48 h
                  </span>
                )}
                <ButtonLink href={item.href} variant="outline" size="sm">
                  Voir
                </ButtonLink>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
