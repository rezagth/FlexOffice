import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { NotFoundError } from "@/server/lib/errors";
import { findInvoiceForAdmin } from "@/server/domains/invoicing/queries";
import { invoicePdfResponse, isUuid } from "@/server/domains/invoicing/pdf-response";
import { recordAudit } from "@/server/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/invoices/[id]/pdf — Auth: platform administration. Any
// invoice or credit note (not scoped to one organization — see
// /api/invoices/[id]/pdf and /api/landlord/accounting/[id]/pdf for the
// caller-scoped equivalents). Same pattern as the verification document
// viewer and the domiciliation attestation viewer: viewing someone else's
// financial document is audited before the PDF is ever served.
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) throw new NotFoundError("Facture introuvable.");

  const invoice = await findInvoiceForAdmin(id);
  if (!invoice) throw new NotFoundError("Facture introuvable.");

  await recordAudit({
    event: "invoice.viewed_by_admin",
    actorUserId: ctx.userId,
    organizationId: invoice.organizationId,
    metadata: { invoiceId: id, kind: invoice.kind, number: invoice.number },
  });

  return invoicePdfResponse(invoice);
});
