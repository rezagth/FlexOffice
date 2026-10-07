import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { InvoiceDocument } from "@/components/dashboard/invoice-document";
import { EmptyState } from "@/components/dashboard/states";
import { ensureInvoiceDocumentsForPayment } from "@/server/domains/invoicing/issue";
import { listPaymentDocuments } from "@/server/domains/invoicing/queries";
import { buildInvoiceView } from "@/server/domains/invoicing/view";
import { isUuid } from "@/server/domains/invoicing/pdf-response";
import { CAPTURED_PAYMENT_STATUSES } from "@/server/domains/payments/settled-amounts";
import { logError } from "@/server/lib/logger";

export const metadata = { title: "Facture — OfficeFlex" };
export const dynamic = "force-dynamic";

/** The invoice issued in the organization's name for one payment, and its
 * credit notes. Same capability as the PDF route: landlord:view_revenue. */
export default async function LandlordInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePageLandlordOrg("landlord:view_revenue");
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const payment = await prisma.payment.findFirst({
    where: { id, organizationId: ctx.activeOrgId, status: { in: [...CAPTURED_PAYMENT_STATUSES] } },
    select: { id: true },
  });
  if (!payment) notFound();

  await ensureInvoiceDocumentsForPayment(payment.id).catch((error) =>
    logError({ event: "invoicing.issue_on_view_failed", error, payment_id: payment.id })
  );
  const documents = await listPaymentDocuments(payment.id);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/landlord/accounting" className="text-xs text-muted-foreground hover:underline print:hidden">
        ← Pièces comptables
      </Link>
      {documents.length === 0 ? (
        <EmptyState
          title="Facture en cours d'émission"
          description="Le paiement est bien enregistré. La facture sera disponible ici dans quelques minutes."
        />
      ) : (
        documents.map((document) => (
          <InvoiceDocument
            key={document.id}
            view={buildInvoiceView(document)}
            pdfHref={`/api/landlord/accounting/${document.id}/pdf`}
          />
        ))
      )}
    </div>
  );
}
