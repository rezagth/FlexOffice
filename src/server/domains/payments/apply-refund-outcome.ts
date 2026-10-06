import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { logEvent } from "@/server/lib/logger";
import { syncPaymentRefundStatus } from "./refunds";

const STATUS_MAP: Record<string, "SUCCEEDED" | "FAILED"> = {
  succeeded: "SUCCEEDED",
  failed: "FAILED",
};

/**
 * The only place a real Stripe refund ever becomes SUCCEEDED/FAILED in our
 * ledger — resolveDispute() creates the Refund row as PENDING for the
 * Stripe provider (see review.ts) because refundPaymentIntent() never
 * trusts the synchronous API response; this is called from the webhook
 * handler once a `refund.updated`/`charge.refunded` event is verified.
 *
 * Idempotent via the conditional `updateMany` (only applies while the row
 * is still PENDING), same pattern as applyPaymentOutcome — a retried
 * webhook delivery is a safe no-op.
 */
export async function applyRefundOutcome(
  providerRefundId: string,
  providerStatus: string,
  refundRowId?: string | null
) {
  const status = STATUS_MAP[providerStatus];
  if (!status) {
    // "pending"/"canceled" and any other intermediate Stripe status: not
    // actionable yet, wait for a later event.
    logEvent({ event: "refund.outcome_unhandled_status", provider_refund_id: providerRefundId, status: providerStatus });
    return;
  }

  // Stripe often answers a card refund with refund.created already
  // "succeeded" — possibly before issueRefund() stored the provider id. The
  // row id we put in the refund's metadata finds it in that case.
  if (refundRowId) {
    await prisma.refund.updateMany({
      where: { id: refundRowId, providerRefundId: `pending:${refundRowId}` },
      data: { providerRefundId },
    });
  }

  const updated = await prisma.refund.updateMany({
    where: { providerRefundId, status: "PENDING" },
    data: { status },
  });

  if (updated.count === 0) {
    // A refund this app never created (stale test event), or already
    // applied by an earlier delivery of the same event — log and move on.
    logEvent({ event: "refund.outcome_already_applied_or_unknown", provider_refund_id: providerRefundId, status });
    return;
  }

  const refund = await prisma.refund.findUnique({
    where: { providerRefundId },
    include: { payment: true },
  });

  if (refund && status === "SUCCEEDED") await syncPaymentRefundStatus(refund.paymentId);

  await recordAudit({
    event: "refund.outcome_applied",
    organizationId: refund?.payment.organizationId ?? null,
    metadata: { providerRefundId, status, paymentId: refund?.paymentId },
  });
}
