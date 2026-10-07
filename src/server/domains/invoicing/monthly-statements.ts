import { prisma } from "@/server/db/prisma";
import { logError, logEvent } from "@/server/lib/logger";
import { CAPTURED_PAYMENT_STATUSES } from "@/server/domains/payments/settled-amounts";
import {
  generateMonthlyCommissionStatement,
  syncPendingCommissionStatements,
} from "@/server/domains/payments/commission-statements";
import { parisMonthPeriod, previousParisMonth, zonedParts } from "./paris-time";

export type StatementRunResult = {
  organizationId: string;
  outcome: "generated" | "existing" | "nothing_to_bill" | "failed";
  statementId?: string;
};

/**
 * FCT-17 — the commission statements of every organization for one Paris
 * calendar month ("YYYY-MM"). Idempotent: a month already generated for an
 * organization is reported as "existing" (unique constraint on
 * organization + period), so the admin button and the cron can both run it
 * any number of times. One organization failing does not stop the others.
 */
export async function generateCommissionStatementsForMonth(month: string): Promise<StatementRunResult[]> {
  const { periodStart, periodEnd } = parisMonthPeriod(month);

  const [organizations, existing] = await Promise.all([
    prisma.payment.groupBy({
      by: ["organizationId"],
      where: {
        status: { in: [...CAPTURED_PAYMENT_STATUSES] },
        capturedAt: { gte: periodStart, lt: periodEnd },
      },
      orderBy: { organizationId: "asc" },
    }),
    prisma.commissionStatement.findMany({ where: { periodStart }, select: { organizationId: true, id: true } }),
  ]);
  const existingByOrg = new Map(existing.map((s) => [s.organizationId, s.id]));

  const results: StatementRunResult[] = [];
  for (const { organizationId } of organizations) {
    const already = existingByOrg.get(organizationId);
    if (already) {
      results.push({ organizationId, outcome: "existing", statementId: already });
      continue;
    }
    try {
      const statement = await generateMonthlyCommissionStatement(organizationId, periodStart, periodEnd);
      results.push(
        statement
          ? { organizationId, outcome: "generated", statementId: statement.id }
          : { organizationId, outcome: "nothing_to_bill" }
      );
    } catch (error) {
      logError({ event: "commission_statement.generation_failed", error, organization_id: organizationId, month });
      results.push({ organizationId, outcome: "failed" });
    }
  }

  logEvent({
    event: "commission_statement.month_run",
    month,
    organizations: results.length,
    generated: results.filter((r) => r.outcome === "generated").length,
    failed: results.filter((r) => r.outcome === "failed").length,
  });
  return results;
}

/** Hour (Paris) from which the monthly run may start on the 1st: late
 * enough that the previous month's last captures are settled. */
export const MONTHLY_RUN_HOUR = 2;

/**
 * Called by runBookingMaintenance (every 15 minutes). Does nothing except
 * on the 1st of the month from 02:00 Europe/Paris, when it generates the
 * previous month for every organization. Running every quarter of an hour
 * that day is harmless (idempotent) and retries anything that failed. A
 * month missed entirely (server down all day on the 1st) is caught up from
 * the admin page, "Générer maintenant".
 *
 * The Stripe mirror retry runs every time: it only touches statements
 * still unsynced, and does nothing on an instance without Stripe.
 */
export async function runMonthlyCommissionStatements(now: Date = new Date()) {
  const { day, hour } = zonedParts(now);
  const stripe = await syncPendingCommissionStatements().catch((error) => {
    logError({ event: "commission_statement.stripe_retry_failed", error });
    return null;
  });
  if (day !== 1 || hour < MONTHLY_RUN_HOUR) return { ran: false as const, stripe };

  const month = previousParisMonth(now);
  const results = await generateCommissionStatementsForMonth(month);
  return { ran: true as const, month, results, stripe };
}
