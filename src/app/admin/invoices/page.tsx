import { requirePageAdmin } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/states";
import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { parsePageParam, paginationOffsets, totalPageCount } from "@/lib/pagination";
import { formatCents, INVOICE_KIND_LABELS } from "@/lib/format";
import { formatIssueDate } from "@/server/domains/invoicing/view";

export const metadata = { title: "Factures — Admin MakomSpace" };
export const dynamic = "force-dynamic";

/**
 * R63-R66 area — every booking invoice and credit note, across every
 * organization, for platform support/audit. `findInvoiceForAdmin()`
 * (invoicing/queries.ts) already existed for the single-document detail
 * case (the PDF route below); this is the list it was missing. Commission
 * invoices ("Redevances") have their own page — /admin/commission-statements
 * — scoped per statement rather than per document.
 */
export default async function AdminInvoicesPage({ searchParams }: PageProps<"/admin/invoices">) {
  await requirePageAdmin();
  const { page: pageParam } = await searchParams;
  const page = parsePageParam(pageParam);

  const [invoices, totalCount] = await Promise.all([
    prisma.invoice.findMany({
      where: { kind: { in: ["INVOICE", "CREDIT_NOTE"] } },
      include: { organization: { select: { name: true, legalName: true } } },
      orderBy: [{ issuedAt: "desc" }, { sequence: "desc" }],
      ...paginationOffsets(page),
    }),
    prisma.invoice.count({ where: { kind: { in: ["INVOICE", "CREDIT_NOTE"] } } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Factures</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Toutes les factures et avoirs émis pour des réservations, toutes organisations confondues.
          Immuables une fois émis (R64) : une correction passe toujours par un avoir, jamais par une
          modification. Les factures de commission (« Redevances ») sont sur la page des relevés de
          commission.
        </p>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          title="Aucune facture pour l'instant"
          description="Une facture est émise pour chaque réservation payée."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead>Émise le</TableHead>
                <TableHead className="text-right">TTC</TableHead>
                <TableHead>PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium text-foreground">
                    {INVOICE_KIND_LABELS[invoice.kind]} {invoice.number}
                  </TableCell>
                  <TableCell>{invoice.organization.legalName || invoice.organization.name}</TableCell>
                  <TableCell className="text-muted-foreground">{formatIssueDate(invoice.issuedAt)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCents(invoice.kind === "CREDIT_NOTE" ? -invoice.totalCents : invoice.totalCents)}
                  </TableCell>
                  <TableCell>
                    <a href={`/api/admin/invoices/${invoice.id}/pdf`} download className="underline">
                      PDF
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <PaginationControls
            page={page}
            totalPages={totalPageCount(totalCount)}
            basePath="/admin/invoices"
            searchParams={{}}
          />
        </>
      )}
    </div>
  );
}
