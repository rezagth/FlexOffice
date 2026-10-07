import { requireAdmin } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { withErrorHandling } from "@/server/lib/http";
import { NotFoundError } from "@/server/lib/errors";
import { invoicePdfResponse, isUuid } from "@/server/domains/invoicing/pdf-response";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/commission-statements/[id]/pdf — Auth: platform
// administration. The FC commission invoice of one statement.
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) throw new NotFoundError("Relevé introuvable.");

  const invoice = await prisma.invoice.findUnique({
    where: { commissionStatementId: id },
    include: { creditedInvoice: { select: { number: true, issuedAt: true } } },
  });
  if (!invoice) throw new NotFoundError("Relevé introuvable.");

  return invoicePdfResponse(invoice);
});
