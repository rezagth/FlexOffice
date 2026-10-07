import { requireAuth } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { NotFoundError } from "@/server/lib/errors";
import { findClientInvoice } from "@/server/domains/invoicing/queries";
import { invoicePdfResponse, isUuid } from "@/server/domains/invoicing/pdf-response";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/invoices/[id]/pdf — Auth: signed-in client. Only the invoices
// and credit notes of the caller's own bookings; anything else (another
// client's document, a commission invoice, an unknown id) is a 404.
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAuth();
  const { id } = await params;
  if (!isUuid(id)) throw new NotFoundError("Document introuvable.");

  const invoice = await findClientInvoice(id, ctx.userId);
  if (!invoice) throw new NotFoundError("Document introuvable.");

  return invoicePdfResponse(invoice);
});
