import { z } from "zod";

export const raiseDisputeSchema = z.object({
  description: z.string().trim().min(1).max(2000),
});
export type RaiseDisputeInput = z.infer<typeof raiseDisputeSchema>;

export const resolveDisputeSchema = z.object({
  outcome: z.enum(["REFUND", "NO_ACTION"]),
  notes: z.string().trim().min(1).max(1000),
  /** Only read when outcome is REFUND. Defaults to the full payment amount
   * server-side (see resolve.ts) — never trusted as the sole source of the
   * amount actually refunded, only ever a ceiling `assertRefundFitsPayment`
   * checks against. */
  refundAmountCents: z.number().int().positive().optional(),
});
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
