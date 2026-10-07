import { requireCapability } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { ForbiddenError, NotFoundError } from "@/server/lib/errors";
import { findOrganizationInvoice } from "@/server/domains/invoicing/queries";
import { invoicePdfResponse, isUuid } from "@/server/domains/invoicing/pdf-response";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/landlord/accounting/[id]/pdf — Auth: landlord:view_revenue in
// the active organization. Any document of that organization (invoices and
// credit notes issued in its name, commission invoices addressed to it);
// another organization's document is a 404.
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireCapability("landlord:view_revenue");
  if (!ctx.activeOrgId) throw new ForbiddenError("Aucune organisation active pour ce compte.");
  const { id } = await params;
  if (!isUuid(id)) throw new NotFoundError("Document introuvable.");

  const invoice = await findOrganizationInvoice(id, ctx.activeOrgId);
  if (!invoice) throw new NotFoundError("Document introuvable.");

  return invoicePdfResponse(invoice);
});
