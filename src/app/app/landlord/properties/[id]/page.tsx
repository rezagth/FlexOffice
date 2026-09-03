import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { getPropertyDetail } from "@/server/domains/properties/get";
import { organizationManagesProperty } from "@/server/domains/properties/access";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/states";
import { PropertyPhotoManager } from "@/components/dashboard/property-photo-manager";
import { PropertyDescriptionForm } from "@/components/dashboard/property-description-form";
import { ArchivePropertyButton } from "@/components/dashboard/archive-property-button";
import {
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  SPACE_STATUS_LABELS,
  SPACE_TYPE_LABELS,
  formatCents,
} from "@/lib/format";

export const metadata = { title: "Détail du bien — OfficeFlex" };
export const dynamic = "force-dynamic";

/**
 * One building: its address and description, its photo gallery, who holds
 * which role on it, and the Spaces attached to it — with a way to add
 * another. No calendar, no listing, no pricing summary here; publication
 * is Phase 6 (Listing).
 */
export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePageLandlordOrg("landlord:manage_properties");
  const { id } = await params;

  const property = await getPropertyDetail(id);
  // Same 404-not-403 rule as everywhere else in the app: a property this
  // organization has no relation to does not exist as far as this page is
  // concerned.
  if (!property || !organizationManagesProperty(property, ctx.activeOrgId)) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{property.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType} ·{" "}
            {property.addressLine1}, {property.postalCode} {property.city}
          </p>
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
        {property.status === "ACTIVE" && <ArchivePropertyButton propertyId={property.id} />}
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-medium">Description</h2>
        <PropertyDescriptionForm propertyId={property.id} initialDescription={property.description ?? ""} />
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-medium">Photos</h2>
        <PropertyPhotoManager propertyId={property.id} initialPhotos={property.photos} />
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-lg font-medium">Titulaires</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Propriétaire</p>
            {property.owners
              .filter((o) => o.endsAt === null)
              .map((o) => (
                <p key={o.id} className="text-sm text-foreground">
                  {o.organization?.name ?? o.profile?.name} ({o.ownershipShareBasisPoints / 100} %)
                </p>
              ))}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Exploitant</p>
            {property.operators
              .filter((o) => o.endsAt === null)
              .map((o) => (
                <p key={o.id} className="text-sm text-foreground">
                  {o.organization?.name ?? o.profile?.name}
                </p>
              ))}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Gestionnaire</p>
            {property.managers.filter((m) => m.endsAt === null).length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun</p>
            ) : (
              property.managers
                .filter((m) => m.endsAt === null)
                .map((m) => (
                  <p key={m.id} className="text-sm text-foreground">
                    {m.organization?.name ?? m.profile?.name}
                  </p>
                ))
            )}
          </div>
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">
            Espaces{property.spaces.length > 0 ? ` (${property.spaces.length})` : ""}
          </h2>
          <ButtonLink href={`/app/landlord/spaces/new?propertyId=${property.id}`} size="sm">
            Ajouter un espace
          </ButtonLink>
        </div>

        {property.spaces.length === 0 ? (
          <EmptyState
            title="Aucun espace pour l'instant"
            description="Ajoutez le premier espace réservable de ce bien."
            action={
              <ButtonLink href={`/app/landlord/spaces/new?propertyId=${property.id}`}>
                Ajouter un espace
              </ButtonLink>
            }
          />
        ) : (
          property.spaces.map((space) => (
            <Link key={space.id} href={`/app/landlord/properties/${property.id}/spaces/${space.id}`}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted">
                <div className="flex items-center gap-3">
                  {space.primaryPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={space.primaryPhotoUrl}
                      alt=""
                      className="h-12 w-16 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="h-12 w-16 shrink-0 rounded-md bg-muted" />
                  )}
                  <div>
                    <p className="font-medium text-foreground">{space.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {SPACE_TYPE_LABELS[space.type] ?? space.type} ·{" "}
                      {SPACE_STATUS_LABELS[space.status] ?? space.status}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-medium">{formatCents(space.dayPriceCents)} / jour</p>
              </Card>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
