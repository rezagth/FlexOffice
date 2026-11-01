import { requirePageAdmin } from "@/server/auth/page-guards";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/states";
import { formatDateTime } from "@/lib/format";
import { AdminActionButton } from "@/components/dashboard/admin-action-button";
import { SpaceModerationActions } from "@/components/dashboard/space-moderation-actions";
import { listReviewQueue, type ReviewQueueKind } from "@/server/domains/admin/review-queue";

export const metadata = { title: "À traiter — Admin MakomSpace" };
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<ReviewQueueKind, string> = {
  organization: "Société à valider",
  space: "Espace à valider",
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
          Sociétés et espaces à valider, vérifications, domiciliations et promotions en attente d&apos;une décision, de la plus
          ancienne à la plus récente.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Rien à traiter" description="Aucune demande en attente pour l'instant." />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <Card key={`${item.kind}-${item.id}`} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{item.organizationName}</p>
                  <p className="text-sm text-muted-foreground">
                    {KIND_LABELS[item.kind]} ({item.summary}) · {formatDateTime(item.submittedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.overdue && (
                    <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                      En attente depuis plus de 48 h
                    </span>
                  )}
                  {/* Decided right here when the decision is a single action;
                      the other kinds need their own screen (documents to read,
                      a form to answer) and open it. */}
                  {item.kind === "space" && <SpaceModerationActions spaceId={item.id} />}
                  {item.kind === "organization" && (
                    <AdminActionButton
                      url={`/api/admin/organizations/${item.id}/verify`}
                      label="Valider la société"
                      confirmLabel="Confirmer la validation"
                      variant="primary"
                      reason="optional"
                      reasonLabel="Note interne (facultatif)"
                      reasonHint="Gardée dans le journal d'audit, jamais envoyée à la société."
                      warning="Elle pourra réserver tout de suite."
                    />
                  )}
                  {item.kind !== "space" && item.kind !== "organization" && (
                    <ButtonLink href={item.href} variant="outline" size="sm">
                      Voir
                    </ButtonLink>
                  )}
                </div>
              </div>
              {item.details && (
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {item.details.map((d) => (
                    <div key={d.label} className={d.label === "Description" ? "sm:col-span-2" : undefined}>
                      <dt className="text-muted-foreground">{d.label}</dt>
                      <dd className="whitespace-pre-line">{d.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
