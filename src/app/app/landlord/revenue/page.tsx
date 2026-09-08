import Link from "next/link";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { computeOrganizationOccupancy } from "@/server/domains/bookings/occupancy";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/dashboard/states";
import { formatCents, formatDateTime, invoiceNumber } from "@/lib/format";
import { occupancyIncentiveMessage } from "@/lib/occupancy-incentive";

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Calendar month to date — "mois en cours", the simpler of the two
 * periods the brief allows ("mois en cours ou glissant"). */
function currentMonthToDate(): { from: string; to: string } {
  const now = new Date();
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from: firstOfMonth.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

export const dynamic = "force-dynamic";

export default async function PartnerRevenuePage() {
  const ctx = await requirePageLandlordOrg("landlord:view_revenue");
  const { from: monthStart, to: monthEnd } = currentMonthToDate();

  const [totals, payments, commissionStatements, occupancyBySpace, monthRevenue] = await Promise.all([
    prisma.payment.aggregate({
      where: { organizationId: ctx.activeOrgId, status: "SUCCEEDED" },
      _sum: { amountCents: true, commissionAmountCents: true, netAmountCents: true },
    }),
    prisma.payment.findMany({
      where: { organizationId: ctx.activeOrgId, status: "SUCCEEDED" },
      include: { booking: { include: { space: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.commissionStatement.findMany({
      where: { organizationId: ctx.activeOrgId },
      orderBy: { periodStart: "desc" },
    }),
    computeOrganizationOccupancy(ctx.activeOrgId, monthStart, monthEnd),
    prisma.payment.aggregate({
      where: { organizationId: ctx.activeOrgId, status: "SUCCEEDED", createdAt: { gte: new Date(`${monthStart}T00:00:00Z`) } },
      _sum: { amountCents: true },
    }),
  ]);

  const totalOpenSlots = occupancyBySpace.reduce((sum, o) => sum + o.openSlotCount, 0);
  const totalBookedSlots = occupancyBySpace.reduce((sum, o) => sum + o.bookedSlotCount, 0);
  const overallOccupancyPercent =
    totalOpenSlots === 0 ? 0 : Math.round((totalBookedSlots / totalOpenSlots) * 100);
  const incentiveMessage = occupancyIncentiveMessage(
    overallOccupancyPercent,
    monthRevenue._sum.amountCents ?? 0
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Revenus</h1>
        {ctx.capabilities.has("landlord:manage_accounting") && (
          <form
            action="/api/landlord/accounting/export"
            className="flex flex-wrap items-end gap-2"
          >
            <Field label="Du" htmlFor="export-from">
              <Input id="export-from" type="date" name="from" defaultValue={isoDateDaysAgo(365)} />
            </Field>
            <Field label="Au" htmlFor="export-to">
              <Input id="export-to" type="date" name="to" defaultValue={isoDateDaysAgo(0)} />
            </Field>
            <Button type="submit" variant="outline" size="sm">
              Exporter en CSV
            </Button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Revenu brut
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatCents(totals._sum.amountCents ?? 0)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Commission OfficeFlex
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatCents(totals._sum.commissionAmountCents ?? 0)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Revenu net reversé
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatCents(totals._sum.netAmountCents ?? 0)}
          </p>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Taux d&apos;occupation — mois en cours</h2>

        {occupancyBySpace.length === 0 ? (
          <EmptyState
            title="Aucun espace publié"
            description="Le taux d'occupation s'affichera dès qu'un espace sera publié."
          />
        ) : (
          <>
            <Card className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Tous les espaces confondus
              </p>
              <p className="mt-2 text-2xl font-semibold">{overallOccupancyPercent} %</p>
              {incentiveMessage && (
                <p className="mt-2 text-sm text-muted-foreground">{incentiveMessage}</p>
              )}
            </Card>

            <div className="flex flex-col gap-2">
              {occupancyBySpace.map((space) => (
                <Card key={space.spaceId} className="flex items-center justify-between p-4">
                  <p className="font-medium text-foreground">{space.spaceName}</p>
                  <p className="text-sm font-medium">
                    {space.openSlotCount === 0 ? "Aucun créneau ouvert ce mois-ci" : `${space.occupancyRatePercent} %`}
                  </p>
                </Card>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Relevés de commission</h2>
        {commissionStatements.length === 0 ? (
          <EmptyState
            title="Aucun relevé pour l'instant"
            description="Un relevé mensuel récapitule les commissions déjà prélevées sur vos réservations du mois."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {commissionStatements.map((statement) => (
              <a
                key={statement.id}
                href={statement.hostedInvoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted">
                  <p className="font-medium text-foreground">
                    {statement.periodStart.toLocaleDateString("fr-FR", {
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-sm font-medium">
                    {formatCents(statement.totalCommissionAmountCents)}
                  </p>
                </Card>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Factures</h2>
        {payments.length === 0 ? (
          <EmptyState
            title="Aucune facture pour l'instant"
            description="Une facture est générée pour chaque réservation payée."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {payments.map((payment) => (
              <Link key={payment.id} href={`/app/landlord/accounting/${payment.id}`} className="block">
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted">
                  <div>
                    <p className="font-medium text-foreground">{invoiceNumber(payment)}</p>
                    <p className="text-sm text-muted-foreground">
                      {payment.booking.space.name} · {formatDateTime(payment.createdAt)}
                    </p>
                  </div>
                  <p className="text-sm font-medium">{formatCents(payment.netAmountCents)}</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
