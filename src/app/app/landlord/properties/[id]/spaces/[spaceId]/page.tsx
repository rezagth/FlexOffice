import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { getPropertyDetail } from "@/server/domains/properties/get";
import { getSpaceForProperty } from "@/server/domains/properties/spaces";
import { organizationManagesProperty } from "@/server/domains/properties/access";
import { SpaceForm, type WeekdayHours } from "@/components/dashboard/space-form";
import { SubmitSpaceButton } from "@/components/dashboard/submit-space-button";
import { ArchiveSpaceButton } from "@/components/dashboard/archive-space-button";
import { ClosureForm } from "@/components/dashboard/closure-form";
import { DeleteClosureButton } from "@/components/dashboard/delete-closure-button";
import { Card } from "@/components/ui/card";
import { SPACE_STATUS_LABELS, formatDateTime } from "@/lib/format";

export const metadata = { title: "Détail de l'espace — OfficeFlex" };
export const dynamic = "force-dynamic";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * The canonical space detail/edit screen (Étape 32): informations,
 * equipment, photos and hours all live inside `SpaceForm` (reused, not
 * duplicated); closures and the archive action are specific to this page.
 * `/app/landlord/spaces/[id]/edit` still works unchanged (Étape 26
 * compatibility) — this is the newer, property-nested way to reach the
 * same space, matching Property → Space in the URL the way it already
 * does in the data model.
 */
export default async function PropertySpaceDetailPage({
  params,
}: {
  params: Promise<{ id: string; spaceId: string }>;
}) {
  const ctx = await requirePageLandlordOrg("landlord:manage_properties");
  const { id: propertyId, spaceId } = await params;

  const property = await getPropertyDetail(propertyId);
  if (!property || !organizationManagesProperty(property, ctx.activeOrgId)) {
    notFound();
  }

  const space = await getSpaceForProperty(propertyId, spaceId).catch(() => null);
  if (!space) notFound();

  const initialHours: WeekdayHours[] = WEEKDAYS.map((weekday) => ({
    weekday,
    slots: space.openingHours
      .filter((h) => h.weekday === weekday)
      .map((h) => ({ opensAt: h.opensAt, closesAt: h.closesAt })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link href={`/app/landlord/properties/${propertyId}`} className="hover:underline">
              {property.label}
            </Link>
          </p>
          <h1 className="text-2xl font-semibold text-foreground">{space.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Statut : {SPACE_STATUS_LABELS[space.status] ?? space.status}
          </p>
        </div>
        <div className="flex gap-2">
          {(space.status === "DRAFT" || space.status === "REJECTED") && (
            <SubmitSpaceButton spaceId={space.id} />
          )}
          {space.status !== "ARCHIVED" && (
            <ArchiveSpaceButton propertyId={propertyId} spaceId={space.id} />
          )}
        </div>
      </div>

      <SpaceForm
        spaceId={space.id}
        initialHours={initialHours}
        initialPhotos={space.spacePhotos}
        initialPropertyId={propertyId}
        initialValues={{
          name: space.name,
          type: space.type,
          description: space.description,
          address: space.address,
          city: space.city,
          postalCode: space.postalCode,
          capacity: String(space.capacity),
          amenities: space.amenities,
          halfDayPrice: (space.halfDayPriceCents / 100).toString(),
          dayPrice: (space.dayPriceCents / 100).toString(),
          accessInstructions: space.accessInstructions ?? "",
          timezone: space.timezone,
        }}
      />

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Fermetures exceptionnelles</h2>
        <p className="text-sm text-muted-foreground">
          Bloque une période sur le calendrier de cet espace (congés, maintenance).
        </p>
        {space.closures.length > 0 && (
          <div className="flex flex-col gap-2">
            {space.closures.map((closure) => (
              <div
                key={closure.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2"
              >
                <div className="text-sm">
                  <p className="font-medium text-foreground">{closure.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(closure.startsAt)} → {formatDateTime(closure.endsAt)}
                  </p>
                </div>
                <DeleteClosureButton spaceId={space.id} closureId={closure.id} />
              </div>
            ))}
          </div>
        )}
        <ClosureForm spaceId={space.id} />
      </Card>
    </div>
  );
}
