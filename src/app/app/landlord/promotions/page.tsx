import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/states";
import { formatCents, formatDateTime } from "@/lib/format";
import { listPromotionsForOrganization } from "@/server/domains/promotions/partner";

export const metadata = { title: "Promotions — MakomSpace" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  PENDING: "En attente de validation",
  PUBLISHED: "Publiée",
  REJECTED: "Refusée",
  EXPIRED: "Expirée",
};

const REASON_LABELS: Record<string, string> = {
  INCONSISTENT_PRICE: "Prix incohérent",
  INVALID_DATES: "Dates invalides",
  INAPPROPRIATE_CONTENT: "Contenu inapproprié",
  MISSING_INFORMATION: "Informations manquantes",
  OTHER: "Autre",
};

function discountLabel(promotion: { discountType: "PERCENTAGE" | "FIXED_AMOUNT"; discountPercent: number | null; discountAmountCents: number | null }): string {
  return promotion.discountType === "PERCENTAGE"
    ? `-${promotion.discountPercent} %`
    : `-${formatCents(promotion.discountAmountCents ?? 0)}`;
}

/**
 * PRD V1.1, R34-R39 — the partner's own promotions, newest first. Visible to
 * any member of the organization (read-only); creating, editing or
 * submitting one is restricted to OWNER/ADMIN server-side
 * (promotions/access.ts) — the "Nouvelle promotion" action simply fails
 * with a clear error for anyone else, same layered approach as every other
 * OWNER/ADMIN-only action in this codebase.
 */
export default async function LandlordPromotionsPage() {
  const ctx = await requirePageLandlordOrg("landlord:publish_listing");
  const promotions = await listPromotionsForOrganization(ctx.activeOrgId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Promotions</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Une remise sur un ou plusieurs de vos espaces, validée par l&apos;équipe MakomSpace avant
            de s&apos;appliquer.
          </p>
        </div>
        <ButtonLink href="/app/landlord/promotions/new">Nouvelle promotion</ButtonLink>
      </div>

      {promotions.length === 0 ? (
        <EmptyState
          title="Aucune promotion"
          description="Créez une promotion pour proposer une remise sur un ou plusieurs de vos espaces."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {promotions.map((promotion) => (
            <Card key={promotion.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">
                    {promotion.spaces.map((s) => s.space.name).join(", ")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    du {formatDateTime(promotion.startsAt)}
                    {promotion.endsAt ? ` au ${formatDateTime(promotion.endsAt)}` : " — sans date de fin"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{discountLabel(promotion)}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {STATUS_LABELS[promotion.status]}
                  </span>
                </div>
              </div>

              {promotion.status === "REJECTED" && promotion.rejectionReason && (
                <p className="text-sm text-danger">
                  Motif du refus : {REASON_LABELS[promotion.rejectionReason]}
                  {promotion.rejectionNote ? ` — ${promotion.rejectionNote}` : ""}
                </p>
              )}

              <div>
                <ButtonLink href={`/app/landlord/promotions/${promotion.id}/edit`} variant="outline" size="sm">
                  {promotion.status === "EXPIRED" ? "Consulter" : "Modifier"}
                </ButtonLink>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
