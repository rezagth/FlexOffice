import { z } from "zod";

/**
 * Admin trigger for the monthly commission statements. Only which calendar
 * month ("YYYY-MM", Europe/Paris) and, optionally, one organization come
 * from the caller — the billed period is always derived from the month
 * server-side (invoicing/paris-time.ts), never accepted as a raw date
 * range. Without `organizationId`, every organization with captured
 * payments that month is processed.
 */
export const generateCommissionStatementSchema = z.object({
  organizationId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format attendu : AAAA-MM"),
});

export type GenerateCommissionStatementInput = z.infer<
  typeof generateCommissionStatementSchema
>;
