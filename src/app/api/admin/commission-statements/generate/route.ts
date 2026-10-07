import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import {
  generateCommissionStatementSchema,
  monthToPeriod,
} from "@/lib/validation/commission-statements";
import { generateMonthlyCommissionStatement } from "@/server/domains/payments/commission-statements";
import { notifyCommissionStatementIssued } from "@/server/domains/notifications/send-notifications";
import { prisma } from "@/server/db/prisma";

// POST /api/admin/commission-statements/generate — Auth: required, platform
// administration only. Body carries an organization and a calendar month
// only ("YYYY-MM") — the billed period is always derived from it server-side
// (monthToPeriod), never accepted as a raw date range.
export const POST = withErrorHandling(async (request: Request) => {
  await requireAdmin();
  const input = generateCommissionStatementSchema.parse(await request.json());
  const { periodStart, periodEnd } = monthToPeriod(input.month);

  // Generation is idempotent (it returns the existing statement on a
  // re-run), so whether it is new is decided here: the landlord is e-mailed
  // once, when the statement first exists.
  const existedBefore = await prisma.commissionStatement.findUnique({
    where: { organizationId_periodStart: { organizationId: input.organizationId, periodStart } },
    select: { id: true },
  });

  const statement = await generateMonthlyCommissionStatement(
    input.organizationId,
    periodStart,
    periodEnd
  );

  if (!statement) {
    return NextResponse.json({ statement: null, message: "Aucun paiement sur cette période" });
  }
  if (!existedBefore) await notifyCommissionStatementIssued(statement.id);
  return NextResponse.json({ statement });
});
