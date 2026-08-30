import { notFound, redirect } from "next/navigation";
import { getPublishedSpaceBySlug } from "@/server/domains/spaces/list-spaces";
import { getAuthContext } from "@/server/auth/rbac";
import { computeDaySlots } from "@/server/domains/bookings/availability";
import { SiteHeader } from "@/components/marketing/site-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BookingFunnel, type SlotOption } from "@/components/booking/booking-funnel";

export const dynamic = "force-dynamic";

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default async function BookingPage({
  params,
  searchParams,
}: PageProps<"/spaces/[slug]/booking">) {
  const { slug } = await params;
  const { date: dateParam } = await searchParams;
  const [space, ctx] = await Promise.all([getPublishedSpaceBySlug(slug), getAuthContext()]);
  if (!space) notFound();
  if (!ctx) redirect(`/login?redirectTo=/spaces/${slug}/booking`);

  const date =
    typeof dateParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayIso();

  const daySlots = await computeDaySlots(space.id, date);
  const slots: SlotOption[] = daySlots
    ? (
        [
          daySlots.morning ? { kind: "MORNING" as const, ...daySlots.morning } : null,
          daySlots.afternoon ? { kind: "AFTERNOON" as const, ...daySlots.afternoon } : null,
          { kind: "FULL_DAY" as const, ...daySlots.fullDay },
        ].filter(Boolean) as Array<SlotOption & { startsAt: Date }>
      ).map(({ kind, available, priceCents }) => ({ kind, available, priceCents }))
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Réserver {space.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Proposé par {space.organization.name} · {space.city}
          </p>
        </div>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-medium">1. Choisissez une date</h2>
          <form className="flex flex-wrap items-end gap-3">
            <Field label="Date" htmlFor="date">
              <Input id="date" name="date" type="date" min={todayIso()} defaultValue={date} />
            </Field>
            <Button type="submit" variant="outline">
              Voir les créneaux
            </Button>
          </form>
        </Card>

        <BookingFunnel
          spaceId={space.id}
          spaceName={space.name}
          date={date}
          slots={slots}
          capacity={space.capacity}
        />
      </main>
    </div>
  );
}
