import { requirePageAdmin } from "@/server/auth/page-guards";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { PromotionReviewActions } from "@/components/dashboard/promotion-review-actions";
import { formatCents, formatDateTime } from "@/lib/format";
import { listPendingPromotionsForAdmin } from "@/server/domains/promotions/admin";

export const metadata = { title: "Promotions — Admin MakomSpace" };
export const dynamic = "force-dynamic";

function discountLabel(promotion: { discountType: "PERCENTAGE" | "FIXED_AMOUNT"; discountPercent: number | null; discountAmountCents: number | null }): string {
  return promotion.discountType === "PERCENTAGE"
    ? `-${promotion.discountPercent} %`
    : `-${formatCents(promotion.discountAmountCents ?? 0)}`;
}

/**
 * PRD V1.1, R48-R52 — promotions en attente de validation, triées par
 * ancienneté (la plus ancienne d'abord) : contrairement aux autres files
 * d'admin de ce dépôt (triées du plus récent au plus ancien), une file de
 * modération doit être traitée dans l'ordre d'arrivée, pas laisser une
 * nouvelle demande doubler une plus ancienne. Un indicateur signale celles
 * en attente depuis plus de 48 h.
 */
export default async function AdminPromotionsPage() {
  await requirePageAdmin();
  const promotions = await listPendingPromotionsForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Promotions</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Promotions en attente de validation, de la plus ancienne à la plus récente. Seule une
          promotion approuvée s&apos;applique aux réservations.
        </p>
      </div>

      {promotions.length === 0 ? (
        <EmptyState
          title="Aucune promotion en attente"
          description="Les promotions soumises par les partenaires apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {promotions.map((promotion) => (
            <Card key={promotion.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{promotion.organization.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {promotion.spaces.map((s) => s.space.name).join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {promotion.overdue && (
                    <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                      En attente depuis plus de 48 h
                    </span>
                  )}
                  <span className="text-sm font-medium text-foreground">{discountLabel(promotion)}</span>
                </div>
              </div>

              <dl className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Période</dt>
                  <dd className="truncate font-medium">
                    du {formatDateTime(promotion.startsAt)}
                    {promotion.endsAt ? ` au ${formatDateTime(promotion.endsAt)}` : " — sans date de fin"}
                  </dd>
                </div>
                {promotion.usageLimit && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Plafond d&apos;utilisation</dt>
                    <dd className="font-medium">{promotion.usageLimit} réservations</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Soumise le</dt>
                  <dd className="font-medium">
                    {promotion.submittedAt ? formatDateTime(promotion.submittedAt) : "—"}
                  </dd>
                </div>
              </dl>

              <PromotionReviewActions promotionId={promotion.id} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
