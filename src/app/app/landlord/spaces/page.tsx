import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { listOrgSpaces } from "@/server/domains/spaces/list-org-spaces";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/states";
import { SPACE_STATUS_LABELS, SPACE_TYPE_LABELS, formatCents } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PartnerSpacesPage() {
  const ctx = await requirePageLandlordOrg("landlord:manage_spaces");
  const spaces = await listOrgSpaces(ctx.activeOrgId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Mes espaces</h1>
        <ButtonLink href="/app/landlord/spaces/new">Publier un espace</ButtonLink>
      </div>

      {spaces.length === 0 ? (
        <EmptyState
          title="Aucun espace pour l'instant"
          description="Publiez votre premier espace : il sera visible publiquement une fois validé."
          action={<ButtonLink href="/app/landlord/spaces/new">Publier un espace</ButtonLink>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {spaces.map((space) => (
            <Card key={space.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{space.name}</p>
                <p className="text-sm text-muted-foreground">
                  {space.property.label} · {SPACE_TYPE_LABELS[space.type] ?? space.type} ·{" "}
                  {space.city} · {SPACE_STATUS_LABELS[space.status] ?? space.status}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-sm font-medium">{formatCents(space.dayPriceCents)} / jour</p>
                <ButtonLink href={`/app/landlord/spaces/${space.id}/edit`} variant="outline" size="sm">
                  Modifier
                </ButtonLink>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
