import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageAuth } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { InvoiceDocument } from "@/components/dashboard/invoice-document";
import { EmptyState } from "@/components/dashboard/states";
import { ensureInvoiceDocumentsForPayment } from "@/server/domains/invoicing/issue";
import { listPaymentDocuments } from "@/server/domains/invoicing/queries";
import { buildInvoiceView } from "@/server/domains/invoicing/view";
import { isUuid } from "@/server/domains/invoicing/pdf-response";
import { CAPTURED_PAYMENT_STATUSES } from "@/server/domains/payments/settled-amounts";
import { logError } from "@/server/lib/logger";

export const metadata = { title: "Facture — MakomSpace" };
export const dynamic = "force-dynamic";

export default async function ClientInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePageAuth();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  // Scoped by the booking's clientUserId, not by an id the caller merely
  // supplies — the same rule every other resource-by-id route follows.
  const payment = await prisma.payment.findFirst({
    where: { id, booking: { clientUserId: ctx.userId }, status: { in: [...CAPTURED_PAYMENT_STATUSES] } },
    select: { id: true },
  });
  if (!payment) notFound();

  // Normally issued at capture; issued here if the capture-time issuance
  // failed and the maintenance job has not caught up yet. Idempotent.
  await ensureInvoiceDocumentsForPayment(payment.id).catch((error) =>
    logError({ event: "invoicing.issue_on_view_failed", error, payment_id: payment.id })
  );
  const documents = await listPaymentDocuments(payment.id);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/invoices" className="text-xs text-muted-foreground hover:underline print:hidden">
        ← Factures
      </Link>
      {documents.length === 0 ? (
        <EmptyState
          title="Facture en cours d'émission"
          description="Votre paiement est bien enregistré. La facture sera disponible ici dans quelques minutes."
        />
      ) : (
        documents.map((document) => (
          <InvoiceDocument
            key={document.id}
            view={buildInvoiceView(document)}
            pdfHref={`/api/invoices/${document.id}/pdf`}
          />
        ))
      )}
    </div>
  );
}
