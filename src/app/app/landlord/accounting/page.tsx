import Link from "next/link";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { formatCents, INVOICE_KIND_LABELS } from "@/lib/format";
import { formatIssueDate } from "@/server/domains/invoicing/view";
import { formatParisMonth } from "@/server/domains/invoicing/paris-time";

export const metadata = { title: "Pièces comptables — MakomSpace" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/**
 * Every invoicing document of the active organization: the invoices and
 * credit notes MakomSpace issued in its name (billing mandate), and the
 * monthly commission invoices MakomSpace addressed to it.
 */
export default async function LandlordAccountingPage() {
  const ctx = await requirePageLandlordOrg("landlord:view_revenue");

  const [issued, commissions] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId: ctx.activeOrgId, kind: { in: ["INVOICE", "CREDIT_NOTE"] } },
      include: {
        payment: { select: { id: true } },
        refund: { select: { paymentId: true } },
      },
      orderBy: [{ issuedAt: "desc" }, { sequence: "desc" }],
      take: PAGE_SIZE,
    }),
    prisma.commissionStatement.findMany({
      where: { organizationId: ctx.activeOrgId },
      include: { invoice: { select: { number: true, totalCents: true, netCents: true, vatCents: true } } },
      orderBy: { periodStart: "desc" },
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Pièces comptables</h1>
        <Link href="/app/landlord/revenue" className="text-sm text-muted-foreground hover:underline">
          Revenus et export CSV →
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Factures et avoirs émis en votre nom</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          MakomSpace émet ces documents au nom et pour le compte de votre organisation, en vertu du
          mandat de facturation prévu aux conditions générales de vente. Ils sont numérotés dans une
          série propre à votre organisation, sans rupture.
        </p>
        {issued.length === 0 ? (
          <EmptyState
            title="Aucune facture pour l'instant"
            description="Une facture est émise pour chaque réservation payée."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {issued.map((document) => {
              const paymentId = document.payment?.id ?? document.refund?.paymentId;
              const amount = document.kind === "CREDIT_NOTE" ? -document.totalCents : document.totalCents;
              return (
                <Link key={document.id} href={`/app/landlord/accounting/${paymentId}`} className="block">
                  <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted">
                    <div>
                      <p className="font-medium text-foreground">
                        {INVOICE_KIND_LABELS[document.kind]} {document.number}
                      </p>
                      <p className="text-sm text-muted-foreground">{formatIssueDate(document.issuedAt)}</p>
                    </div>
                    <p className="text-sm font-medium">{formatCents(amount)} TTC</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Factures de commission MakomSpace</h2>
        {commissions.length === 0 ? (
          <EmptyState
            title="Aucune facture de commission pour l'instant"
            description="Une facture mensuelle récapitule les commissions déjà prélevées sur vos réservations du mois. Elle est émise le 1er du mois suivant."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {commissions.map((statement) => (
              <Link
                key={statement.id}
                href={`/app/landlord/accounting/commission/${statement.id}`}
                className="block"
              >
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted">
                  <div>
                    <p className="font-medium capitalize text-foreground">{formatParisMonth(statement.periodStart)}</p>
                    <p className="text-sm text-muted-foreground">{statement.invoice?.number ?? "—"}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium">{formatCents(statement.totalCommissionAmountCents)} TTC</p>
                    {statement.invoice && (
                      <p className="text-xs text-muted-foreground">
                        {formatCents(statement.invoice.netCents)} HT · TVA {formatCents(statement.invoice.vatCents)}
                      </p>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
