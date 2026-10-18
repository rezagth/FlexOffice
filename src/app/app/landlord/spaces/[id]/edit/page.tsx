import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { getPublicPhotoUrl } from "@/server/domains/media/photo-storage";
import { SpaceForm, type WeekdayHours } from "@/components/dashboard/space-form";
import { SubmitSpaceButton } from "@/components/dashboard/submit-space-button";
import { Card } from "@/components/ui/card";
import { SPACE_STATUS_LABELS } from "@/lib/format";

export const dynamic = "force-dynamic";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export default async function EditSpacePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageLandlordOrg("landlord:manage_spaces");

  const { id } = await params;
  const space = await prisma.space.findFirst({
    where: { id, organizationId: ctx.activeOrgId },
    include: {
      openingHours: { orderBy: { opensAt: "asc" } },
      spacePhotos: { orderBy: { position: "asc" } },
    },
  });
  if (!space) notFound();

  const initialPhotos = space.spacePhotos.map((p) => ({ ...p, url: getPublicPhotoUrl(p.storagePath) }));

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
          <h1 className="text-2xl font-semibold text-foreground">{space.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Statut : {SPACE_STATUS_LABELS[space.status] ?? space.status}
          </p>
        </div>
        {(space.status === "DRAFT" || space.status === "REJECTED") && (
          <SubmitSpaceButton spaceId={space.id} />
        )}
      </div>

      {space.status === "ARCHIVED" ? (
        <Card className="flex flex-col gap-2 p-5">
          <h2 className="text-lg font-medium">Espace archivé — lecture seule</h2>
          <p className="text-sm text-muted-foreground">
            Cet espace n&apos;est plus proposé à la réservation et ne peut plus être modifié. Pour
            consulter ses réservations à venir, ouvrez-le depuis{" "}
            <Link href={`/app/landlord/properties/${space.propertyId}/spaces/${space.id}`} className="underline">
              la fiche de votre bien
            </Link>
            .
          </p>
        </Card>
      ) : (
        <SpaceForm
          spaceId={space.id}
          initialHours={initialHours}
          initialPhotos={initialPhotos}
          initialPropertyId={space.propertyId}
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
            cancellationWindowHours: String(space.cancellationWindowHours),
            timezone: space.timezone,
          }}
        />
      )}
    </div>
  );
}
