import { requirePageAdmin } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/format";
import {
  getActiveSpacesCount,
  getAverageOccupancyRate,
  getAverageResponseTimeHours,
  getMonthlyBookingsCount,
  getSearchToBookingConversionRate,
} from "@/server/domains/analytics/kpis";

export const dynamic = "force-dynamic";

function formatPercent(rate: number | null): string {
  return rate == null ? "—" : `${(rate * 100).toFixed(1)} %`;
}

function formatHours(hours: number | null): string {
  if (hours == null) return "—";
  return hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`;
}

export default async function AdminDashboardPage() {
  await requirePageAdmin();

  const [
    organizationsCount,
    activeSpacesCount,
    bookingsCount,
    revenue,
    monthlyBookings,
    conversionRate,
    occupancyRate,
    responseTimeHours,
  ] = await Promise.all([
    prisma.organization.count(),
    getActiveSpacesCount(),
    prisma.booking.count(),
    prisma.payment.aggregate({
      where: { status: "SUCCEEDED" },
      _sum: { commissionAmountCents: true },
    }),
    getMonthlyBookingsCount(),
    getSearchToBookingConversionRate(),
    getAverageOccupancyRate(),
    getAverageResponseTimeHours(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Vue d&apos;ensemble</h1>
        <p className="text-sm text-muted-foreground">
          Indicateurs globaux de la plateforme OfficeFlex.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Entreprises inscrites
          </p>
          <p className="mt-2 text-2xl font-semibold">{organizationsCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Espaces actifs
          </p>
          <p className="mt-2 text-2xl font-semibold">{activeSpacesCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Réservations totales
          </p>
          <p className="mt-2 text-2xl font-semibold">{bookingsCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Chiffre d&apos;affaires plateforme
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatCents(revenue._sum.commissionAmountCents ?? 0)}
          </p>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-medium text-foreground">
          KPI du cahier des charges
        </h2>
        <p className="text-sm text-muted-foreground">
          Cibles : 6 mois après lancement / 12 mois après lancement.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Réservations ce mois-ci
            </p>
            <p className="mt-2 text-2xl font-semibold">{monthlyBookings}</p>
            <p className="mt-1 text-xs text-muted-foreground">Cible : 80 / 400</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Conversion recherche → réservation
            </p>
            <p className="mt-2 text-2xl font-semibold">{formatPercent(conversionRate)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cible : 8 % / 12 % · approximation, pas un tunnel par visiteur (recherche
              anonyme, voir SearchEvent)
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Taux d&apos;occupation moyen
            </p>
            <p className="mt-2 text-2xl font-semibold">{formatPercent(occupancyRate)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cible : 20 % / 35 % · mois en cours
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Délai de réponse entreprise
            </p>
            <p className="mt-2 text-2xl font-semibold">{formatHours(responseTimeHours)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Cible : &lt; 4 h / &lt; 2 h</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Satisfaction client
            </p>
            <p className="mt-2 text-2xl font-semibold text-muted-foreground">
              Non instrumenté
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cible : ≥ 4,3/5 / ≥ 4,5/5 · nécessite une collecte d&apos;avis, qui
              n&apos;existe pas encore — arrive dans une prochaine itération.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
