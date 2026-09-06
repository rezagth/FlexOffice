import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import {
  generateCommissionStatementSchema,
  monthToPeriod,
} from "@/lib/validation/commission-statements";
import { generateMonthlyCommissionStatement } from "@/server/domains/payments/commission-statements";

// POST /api/admin/commission-statements/generate — Auth: required, platform
// administration only. Body carries an organization and a calendar month
// only ("YYYY-MM") — the billed period is always derived from it server-side
// (monthToPeriod), never accepted as a raw date range.
export const POST = withErrorHandling(async (request: Request) => {
  await requireAdmin();
  const input = generateCommissionStatementSchema.parse(await request.json());
  const { periodStart, periodEnd } = monthToPeriod(input.month);

  const statement = await generateMonthlyCommissionStatement(
    input.organizationId,
    periodStart,
    periodEnd
  );

  if (!statement) {
    return NextResponse.json({ statement: null, message: "Aucun paiement sur cette période" });
  }
  return NextResponse.json({ statement });
});
