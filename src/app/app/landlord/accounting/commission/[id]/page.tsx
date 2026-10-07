import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { InvoiceDocument } from "@/components/dashboard/invoice-document";
import { buildInvoiceView } from "@/server/domains/invoicing/view";
import { isUuid } from "@/server/domains/invoicing/pdf-response";
import { formatParisMonth } from "@/server/domains/invoicing/paris-time";

export const metadata = { title: "Facture de commission — MakomSpace" };
export const dynamic = "force-dynamic";

/** The monthly commission invoice addressed to the organization. */
export default async function LandlordCommissionInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePageLandlordOrg("landlord:view_revenue");
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const statement = await prisma.commissionStatement.findFirst({
    where: { id, organizationId: ctx.activeOrgId },
    include: { invoice: { include: { creditedInvoice: { select: { number: true, issuedAt: true } } } } },
  });
  if (!statement?.invoice) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/landlord/accounting" className="text-xs text-muted-foreground hover:underline print:hidden">
        ← Pièces comptables
      </Link>
      <p className="text-sm text-muted-foreground print:hidden">
        Relevé des commissions de {formatParisMonth(statement.periodStart)}.
        {statement.hostedInvoiceUrl && (
          <>
            {" "}
            <a href={statement.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Voir le relevé Stripe
            </a>
          </>
        )}
      </p>
      <InvoiceDocument
        view={buildInvoiceView(statement.invoice)}
        pdfHref={`/api/landlord/accounting/${statement.invoice.id}/pdf`}
      />
    </div>
  );
}
