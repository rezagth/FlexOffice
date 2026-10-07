import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { ValidationError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { generateCommissionStatementSchema } from "@/lib/validation/commission-statements";
import { generateMonthlyCommissionStatement } from "@/server/domains/payments/commission-statements";
import { generateCommissionStatementsForMonth } from "@/server/domains/invoicing/monthly-statements";
import { parisMonthPeriod } from "@/server/domains/invoicing/paris-time";

// POST /api/admin/commission-statements/generate — Auth: platform
// administration only. Body: { month: "YYYY-MM", organizationId? }. The
// billed period is always the whole Paris calendar month, derived
// server-side. Idempotent: an organization already billed for the month is
// reported as such, never billed twice.
export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requireAdmin();
  const input = generateCommissionStatementSchema.parse(await request.json());
  const { periodStart, periodEnd } = parisMonthPeriod(input.month);

  // A statement freezes the month (one per organization and month): billing
  // a month that is not over would leave its remaining bookings unbilled.
  if (periodEnd.getTime() > Date.now()) {
    throw new ValidationError("Ce mois n'est pas terminé : son relevé ne peut pas encore être généré.");
  }

  await recordAudit({
    event: "commission_statement.manual_run",
    actorUserId: ctx.userId,
    organizationId: input.organizationId ?? null,
    metadata: { month: input.month },
  });

  if (input.organizationId) {
    const statement = await generateMonthlyCommissionStatement(input.organizationId, periodStart, periodEnd);
    if (!statement) {
      return NextResponse.json({ statement: null, message: "Aucune commission à facturer sur cette période" });
    }
    return NextResponse.json({ statement });
  }

  const results = await generateCommissionStatementsForMonth(input.month);
  return NextResponse.json({ month: input.month, results });
});
