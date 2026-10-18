import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { parseSpaceSearchParams } from "@/lib/validation/search";
import { getPublishedSpaceBySlug } from "@/server/domains/spaces/list-spaces";
import { getAuthContext } from "@/server/auth/rbac";
import { getOwnProfile } from "@/server/domains/users/profile";
import { isCompanyInfoComplete, isProfileComplete } from "@/server/domains/users/profile-completion";
import { computeDaySlots } from "@/server/domains/bookings/availability";
import { PortalAwareLayout } from "@/components/marketing/portal-aware-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BookingFunnel, type SlotOption } from "@/components/booking/booking-funnel";

export const dynamic = "force-dynamic";

// A booking step, behind sign-in: useless in a search engine (UX-10).
export async function generateMetadata({
  params,
}: PageProps<"/spaces/[slug]/booking">): Promise<Metadata> {
  const { slug } = await params;
  const space = await getPublishedSpaceBySlug(slug);
  return {
    title: space ? `Réserver ${space.name} — MakomSpace` : "Réservation — MakomSpace",
    robots: { index: false, follow: false },
  };
}

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
  const requestedDate = parseSpaceSearchParams({ date: dateParam }).date;
  const back = `/spaces/${slug}/booking${requestedDate ? `?date=${requestedDate}` : ""}`;
  if (!ctx) {
    redirect(`/login?redirectTo=${encodeURIComponent(back)}`);
  }

  // R15/R22/R62: redirect to the dedicated completion screen rather than
  // letting the funnel fail at the very last step — create-booking.ts
  // enforces the same rules server-side regardless.
  const profile = await getOwnProfile(ctx.userId);
  if (!profile || !isProfileComplete(profile) || !(await isCompanyInfoComplete(ctx.userId))) {
    redirect(`/app/complete-profile?redirectTo=${encodeURIComponent(back)}`);
  }

  const date = requestedDate ?? todayIso();

  const daySlots = await computeDaySlots(space.id, date);
  const slots: SlotOption[] = daySlots
    ? (
        [
          daySlots.morning ? { kind: "MORNING" as const, ...daySlots.morning } : null,
          daySlots.afternoon ? { kind: "AFTERNOON" as const, ...daySlots.afternoon } : null,
          { kind: "FULL_DAY" as const, ...daySlots.fullDay },
        ].filter(Boolean) as Array<Omit<SlotOption, "startsAt" | "endsAt"> & { startsAt: Date; endsAt: Date }>
      ).map(({ kind, available, priceCents, startsAt, endsAt }) => ({
        kind,
        available,
        priceCents,
        // Shown in the recap (UX-17); never sent back — the server
        // recomputes the slot from the date and kind.
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      }))
    : [];

  return (
    // ctx is always set here (redirected to /login above otherwise), so this
    // always renders inside the portal — R9-R14.
    <PortalAwareLayout
      ctx={ctx}
      portalClassName="mx-auto flex w-full max-w-3xl flex-col gap-6"
      publicMainClassName="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10"
    >
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
        timeZone={"timezone" in space ? space.timezone : undefined}
        cancellationWindowHours={
          "cancellationWindowHours" in space && typeof space.cancellationWindowHours === "number"
            ? space.cancellationWindowHours
            : undefined
        }
      />
    </PortalAwareLayout>
  );
}
