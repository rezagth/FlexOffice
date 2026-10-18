import { requireAdmin } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { withErrorHandling } from "@/server/lib/http";
import { NotFoundError } from "@/server/lib/errors";
import { invoicePdfResponse, isUuid } from "@/server/domains/invoicing/pdf-response";
import { recordAudit } from "@/server/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/commission-statements/[id]/pdf — Auth: platform
// administration. The FC commission invoice of one statement. Same pattern
// as /api/admin/invoices/[id]/pdf: viewing is audited before the PDF is
// served.
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) throw new NotFoundError("Relevé introuvable.");

  const invoice = await prisma.invoice.findUnique({
    where: { commissionStatementId: id },
    include: { creditedInvoice: { select: { number: true, issuedAt: true } } },
  });
  if (!invoice) throw new NotFoundError("Relevé introuvable.");

  await recordAudit({
    event: "invoice.viewed_by_admin",
    actorUserId: ctx.userId,
    organizationId: invoice.organizationId,
    metadata: { invoiceId: invoice.id, kind: invoice.kind, number: invoice.number, commissionStatementId: id },
  });

  return invoicePdfResponse(invoice);
});
