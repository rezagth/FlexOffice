import { requirePageAdmin } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/states";
import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { GenerateCommissionStatementsForm } from "@/components/dashboard/generate-commission-statements-form";
import { parsePageParam, paginationOffsets, totalPageCount } from "@/lib/pagination";
import { formatCents, formatDateTime } from "@/lib/format";
import { formatParisMonth, previousParisMonth } from "@/server/domains/invoicing/paris-time";
import { isStripeMirrorEnabled } from "@/server/domains/payments/commission-statements";

export const metadata = { title: "Relevés de commission — Admin MakomSpace" };
export const dynamic = "force-dynamic";

function stripeStatus(statement: { stripeSyncedAt: Date | null; stripeSyncError: string | null }, stripeEnabled: boolean) {
  if (statement.stripeSyncedAt) return { label: "Synchronisé Stripe (payé hors bande)", variant: "muted" as const };
  if (!stripeEnabled) return { label: "Émis (sans Stripe)", variant: "outline" as const };
  if (statement.stripeSyncError) return { label: "Échec Stripe, nouvel essai automatique", variant: "destructive" as const };
  return { label: "Synchronisation Stripe en attente", variant: "outline" as const };
}

/**
 * FCT-17 — every monthly commission statement, with its FC invoice, its
 * Stripe mirror status, and a manual "Générer maintenant" for a month the
 * automatic run (1st of the month, 02:00 Paris) missed.
 */
export default async function AdminCommissionStatementsPage({
  searchParams,
}: PageProps<"/admin/commission-statements">) {
  await requirePageAdmin();
  const { page: pageParam } = await searchParams;
  const page = parsePageParam(pageParam);
  const stripeEnabled = isStripeMirrorEnabled();

  const [statements, totalCount] = await Promise.all([
    prisma.commissionStatement.findMany({
      include: {
        organization: { select: { name: true, legalName: true } },
        invoice: { select: { number: true, netCents: true, vatCents: true, totalCents: true } },
      },
      orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
      ...paginationOffsets(page),
    }),
    prisma.commissionStatement.count(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Relevés de commission</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Une facture de commission (série FC) par entreprise et par mois, émise automatiquement le
          1er du mois à partir de 2 h (heure de Paris) pour le mois précédent. Les montants sont les
          commissions conservées après remboursements, TVA incluse.
          {!stripeEnabled && " Stripe n'est pas configuré sur cette instance : les relevés ne sont pas reproduits dans Stripe."}
        </p>
      </div>

      <GenerateCommissionStatementsForm defaultMonth={previousParisMonth(new Date())} />

      {statements.length === 0 ? (
        <EmptyState
          title="Aucun relevé pour l'instant"
          description="Les relevés apparaîtront ici après la première génération mensuelle."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mois</TableHead>
                <TableHead>Entreprise</TableHead>
                <TableHead>Facture</TableHead>
                <TableHead className="text-right">HT</TableHead>
                <TableHead className="text-right">TVA</TableHead>
                <TableHead className="text-right">TTC</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Documents</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statements.map((statement) => {
                const status = stripeStatus(statement, stripeEnabled);
                return (
                  <TableRow key={statement.id}>
                    <TableCell className="capitalize">{formatParisMonth(statement.periodStart)}</TableCell>
                    <TableCell className="font-medium">
                      {statement.organization.legalName || statement.organization.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{statement.invoice?.number ?? "—"}</TableCell>
                    <TableCell className="text-right">{statement.invoice ? formatCents(statement.invoice.netCents) : "—"}</TableCell>
                    <TableCell className="text-right">{statement.invoice ? formatCents(statement.invoice.vatCents) : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCents(statement.totalCommissionAmountCents)}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant} title={statement.stripeSyncError ?? undefined}>
                        {status.label}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(statement.createdAt)}</p>
                    </TableCell>
                    <TableCell className="flex flex-col gap-1 text-sm">
                      {statement.invoice && (
                        <a href={`/api/admin/commission-statements/${statement.id}/pdf`} download className="underline">
                          PDF
                        </a>
                      )}
                      {statement.hostedInvoiceUrl && (
                        <a href={statement.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                          Stripe
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <PaginationControls
            page={page}
            totalPages={totalPageCount(totalCount)}
            basePath="/admin/commission-statements"
            searchParams={{}}
          />
        </>
      )}
    </div>
  );
}
