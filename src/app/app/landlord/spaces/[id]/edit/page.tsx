import { notFound } from "next/navigation";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { SpaceForm, type OpeningHourRow } from "@/components/dashboard/space-form";
import { SubmitSpaceButton } from "@/components/dashboard/submit-space-button";
import { SPACE_STATUS_LABELS } from "@/lib/format";

export const dynamic = "force-dynamic";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export default async function EditSpacePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageLandlordOrg("landlord:manage_spaces");

  const { id } = await params;
  const space = await prisma.space.findFirst({
    where: { id, organizationId: ctx.activeOrgId },
    include: { openingHours: true },
  });
  if (!space) notFound();

  const hoursByWeekday = new Map(space.openingHours.map((h) => [h.weekday, h]));
  const initialHours: OpeningHourRow[] = WEEKDAYS.map((weekday) => {
    const existing = hoursByWeekday.get(weekday);
    return {
      weekday,
      enabled: Boolean(existing),
      opensAt: existing?.opensAt ?? "09:00",
      closesAt: existing?.closesAt ?? "18:00",
    };
  });

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

      <SpaceForm
        spaceId={space.id}
        initialHours={initialHours}
        initialPhotos={space.photos}
        initialValues={{
          name: space.name,
          type: space.type,
          description: space.description,
          address: space.address,
          city: space.city,
          postalCode: space.postalCode,
          capacity: String(space.capacity),
          amenities: space.amenities.join("\n"),
          halfDayPrice: (space.halfDayPriceCents / 100).toString(),
          dayPrice: (space.dayPriceCents / 100).toString(),
          accessInstructions: space.accessInstructions ?? "",
          timezone: space.timezone,
        }}
      />
    </div>
  );
}
