import { z } from "zod";

/**
 * Admin trigger for a monthly commission statement. Only `organizationId`
 * and which calendar month come from the caller — `periodStart`/`periodEnd`
 * are never accepted directly, so the billed range is always exactly one
 * calendar month, never an arbitrary client-chosen window.
 */
export const generateCommissionStatementSchema = z.object({
  organizationId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format attendu : AAAA-MM"),
});

export type GenerateCommissionStatementInput = z.infer<
  typeof generateCommissionStatementSchema
>;

/** Turns a validated "YYYY-MM" into the [start, end) UTC range for that
 * calendar month — the only shape `generateMonthlyCommissionStatement`
 * accepts. */
export function monthToPeriod(month: string): { periodStart: Date; periodEnd: Date } {
  const [year, monthIndex] = month.split("-").map(Number);
  const periodStart = new Date(Date.UTC(year, monthIndex - 1, 1));
  const periodEnd = new Date(Date.UTC(year, monthIndex, 1));
  return { periodStart, periodEnd };
}
