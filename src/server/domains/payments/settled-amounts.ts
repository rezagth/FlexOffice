import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * What a captured payment is actually worth once its refunds are settled.
 *
 * Revenue figures used to sum payments with status SUCCEEDED only. Since
 * refunds now move a payment to PARTIALLY_REFUNDED / REFUNDED, that would
 * drop real money from the landlord's revenue, the accounting export, the
 * commission statements and the admin KPI — e.g. a client cancelling 30 h
 * ahead leaves the landlord 42.50 € and the platform its 15 € commission.
 *
 *   gross       amount − Σ settled refunds              (kept from the client)
 *   net         net − Σ landlord reversals              (kept by the landlord)
 *   commission  gross − net                             (kept by the platform;
 *               negative when the platform bore a refund on its own)
 */
export const CAPTURED_PAYMENT_STATUSES = ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

export const settledRefundsSelect = {
  where: { status: "SUCCEEDED" as const },
  select: { amountCents: true, landlordReversalCents: true },
};

export type PaymentWithSettledRefunds = {
  amountCents: number;
  netAmountCents: number;
  refunds: { amountCents: number; landlordReversalCents: number }[];
};

export function keptAmounts(payment: PaymentWithSettledRefunds) {
  const refunded = payment.refunds.reduce((sum, r) => sum + r.amountCents, 0);
  const reversed = payment.refunds.reduce((sum, r) => sum + r.landlordReversalCents, 0);
  const grossCents = payment.amountCents - refunded;
  const netCents = payment.netAmountCents - reversed;
  return { grossCents, netCents, commissionCents: grossCents - netCents, refundedCents: refunded };
}

/** Sums kept amounts over captured payments matching `where`. */
export async function sumKeptAmounts(where: Prisma.PaymentWhereInput) {
  const payments = await prisma.payment.findMany({
    where: { ...where, status: { in: [...CAPTURED_PAYMENT_STATUSES] } },
    select: { amountCents: true, netAmountCents: true, refunds: settledRefundsSelect },
  });
  return payments.reduce(
    (totals, payment) => {
      const kept = keptAmounts(payment);
      return {
        grossCents: totals.grossCents + kept.grossCents,
        netCents: totals.netCents + kept.netCents,
        commissionCents: totals.commissionCents + kept.commissionCents,
      };
    },
    { grossCents: 0, netCents: 0, commissionCents: 0 }
  );
}
