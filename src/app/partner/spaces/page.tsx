import { getAuthContext } from "@/server/auth/rbac";
import { listOrgSpaces } from "@/server/domains/spaces/list-org-spaces";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/states";
import { SPACE_TYPE_LABELS, formatCents } from "@/lib/format";

export default async function PartnerSpacesPage() {
  const ctx = await getAuthContext();
  if (!ctx?.organizationId) return null; // layout already redirects non-PARTNER; this guards the brief render race before that redirect completes
  const spaces = await listOrgSpaces(ctx.organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Mes espaces</h1>
        <Button disabled>Publier un espace</Button>
      </div>
      <p className="max-w-lg text-sm text-muted-foreground">
        La création et l&apos;édition d&apos;espaces arrivent dans une prochaine
        itération — ce qui suit reflète les données déjà en base.
      </p>

      {spaces.length === 0 ? (
        <EmptyState
          title="Aucun espace pour l'instant"
          description="Vos espaces publiés, en attente de validation ou en brouillon apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {spaces.map((space) => (
            <Card key={space.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{space.name}</p>
                <p className="text-sm text-muted-foreground">
                  {SPACE_TYPE_LABELS[space.type] ?? space.type} · {space.city} ·{" "}
                  {space.status}
                </p>
              </div>
              <p className="text-sm font-medium">{formatCents(space.dayPriceCents)} / jour</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
