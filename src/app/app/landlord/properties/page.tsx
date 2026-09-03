import Link from "next/link";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { listPropertiesForOrg } from "@/server/domains/properties/get";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/states";
import { PROPERTY_STATUS_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/format";

export const metadata = { title: "Mes biens — OfficeFlex" };
export const dynamic = "force-dynamic";

/**
 * The portfolio: every building the caller's organization owns, operates,
 * or manages — the base the future calendar, listing and pricing screens
 * hang off. Deliberately just a list and a way in: no calendar, no
 * listing, no pricing here (out of Phase 5 scope — that is Phase 6).
 */
export default async function PropertiesPage() {
  const ctx = await requirePageLandlordOrg("landlord:manage_properties");
  const properties = await listPropertiesForOrg(ctx.activeOrgId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Mes biens</h1>
        <ButtonLink href="/app/landlord/properties/new">Ajouter un bien</ButtonLink>
      </div>

      {properties.length === 0 ? (
        <EmptyState
          title="Aucun bien pour l'instant"
          description="Ajoutez votre premier bien : vous pourrez ensuite y rattacher les espaces à louer."
          action={<ButtonLink href="/app/landlord/properties/new">Ajouter un bien</ButtonLink>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => {
            const owner = property.owners[0];
            const operator = property.operators[0];
            return (
              <Link key={property.id} href={`/app/landlord/properties/${property.id}`} className="block">
                <Card className="flex h-full flex-col overflow-hidden p-0 transition-colors hover:bg-muted">
                  <div className="aspect-video w-full bg-muted">
                    {property.primaryPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={property.primaryPhotoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                        Aucune photo
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-4">
                    <p className="font-medium text-foreground">{property.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {property.addressLine1}, {property.city}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType} ·{" "}
                      {property._count.spaces} espace{property._count.spaces > 1 ? "s" : ""}
                    </p>
                    {(owner || operator) && (
                      <p className="text-xs text-muted-foreground">
                        {owner && <>Propriétaire : {owner.organization?.name ?? owner.profile?.name}</>}
                        {owner && operator && " · "}
                        {operator && <>Exploitant : {operator.organization?.name ?? operator.profile?.name}</>}
                      </p>
                    )}
                    <span className="mt-2 inline-flex w-fit items-center gap-1.5 text-xs font-medium text-foreground">
                      <span
                        className={
                          property.status === "ACTIVE"
                            ? "h-1.5 w-1.5 rounded-full bg-primary"
                            : "h-1.5 w-1.5 rounded-full bg-muted-foreground"
                        }
                      />
                      {PROPERTY_STATUS_LABELS[property.status] ?? property.status}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
