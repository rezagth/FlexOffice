import Link from "next/link";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/dashboard/states";
import { formatCents, formatDateTime, invoiceNumber } from "@/lib/format";

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const dynamic = "force-dynamic";

export default async function PartnerRevenuePage() {
  const ctx = await requirePageLandlordOrg("landlord:view_revenue");
  const [totals, payments] = await Promise.all([
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
  ]);

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

      <p className="text-sm text-muted-foreground">
        Le calcul du taux d&apos;occupation et du potentiel de revenu inexploité
        arrive dans une prochaine itération, une fois le calendrier de disponibilité
        implémenté.
      </p>

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
