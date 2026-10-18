import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { NotFoundError } from "@/server/lib/errors";
import { findInvoiceForAdmin } from "@/server/domains/invoicing/queries";
import { invoicePdfResponse, isUuid } from "@/server/domains/invoicing/pdf-response";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/invoices/[id]/pdf — Auth: platform administration. Any
// invoice or credit note (not scoped to one organization — see
// /api/invoices/[id]/pdf and /api/landlord/accounting/[id]/pdf for the
// caller-scoped equivalents).
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) throw new NotFoundError("Facture introuvable.");

  const invoice = await findInvoiceForAdmin(id);
  if (!invoice) throw new NotFoundError("Facture introuvable.");

  return invoicePdfResponse(invoice);
});
