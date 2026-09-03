import Link from "next/link";
import { clsx } from "clsx";
import { requirePageOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { summarizeMonth } from "@/server/domains/bookings/availability";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/states";
import { MonthCalendar } from "@/components/dashboard/month-calendar";
import { ClosureForm } from "@/components/dashboard/closure-form";
import { DeleteClosureButton } from "@/components/dashboard/delete-closure-button";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function PartnerCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string; month?: string }>;
}) {
  const ctx = await requirePageOrg();

  const { space: spaceParam, month: monthParam } = await searchParams;
  const spaces = await prisma.space.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  if (spaces.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-foreground">Calendrier de disponibilité</h1>
        <EmptyState
          title="Aucun espace à afficher"
          description="Publiez un espace pour gérer ses disponibilités et ses fermetures."
          action={<ButtonLink href="/partner/spaces/new">Publier un espace</ButtonLink>}
        />
      </div>
    );
  }

  // Only a space the caller's organization owns can be selected — an
  // unknown or foreign id silently falls back to their first space.
  const selected = spaces.find((s) => s.id === spaceParam) ?? spaces[0];
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonth();

  const [days, closures] = await Promise.all([
    summarizeMonth(selected.id, month),
    prisma.spaceClosure.findMany({
      where: { spaceId: selected.id },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Calendrier de disponibilité</h1>

      {spaces.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {spaces.map((space) => (
            <Link
              key={space.id}
              href={`/partner/calendar?space=${space.id}&month=${month}`}
              className={clsx(
                "rounded-full border px-4 py-1.5 text-sm",
                space.id === selected.id
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              )}
            >
              {space.name}
            </Link>
          ))}
        </div>
      )}

      <Card className="p-5">
        <MonthCalendar
          yearMonth={month}
          days={days}
          hrefForMonth={(m) => `/partner/calendar?space=${selected.id}&month=${m}`}
        />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-medium">Fermetures</h2>
        {closures.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune fermeture programmée.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {closures.map((closure) => (
              <li
                key={closure.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-2 text-sm"
              >
                <span>
                  {formatDateTime(closure.startsAt)} → {formatDateTime(closure.endsAt)} ·{" "}
                  <span className="text-muted-foreground">{closure.reason}</span>
                </span>
                <DeleteClosureButton spaceId={selected.id} closureId={closure.id} />
              </li>
            ))}
          </ul>
        )}
        <ClosureForm spaceId={selected.id} />
      </Card>
    </div>
  );
}
