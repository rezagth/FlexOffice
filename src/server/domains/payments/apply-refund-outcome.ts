import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { logError, logEvent } from "@/server/lib/logger";
import { syncPaymentRefundStatus } from "./refunds";

const STATUS_MAP: Record<string, "SUCCEEDED" | "FAILED"> = {
  succeeded: "SUCCEEDED",
  failed: "FAILED",
  // A canceled refund moved no money either; left PENDING it would count
  // against the refund bounds forever and block any later refund.
  canceled: "FAILED",
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
  if (refund && status === "FAILED") {
    // The client was promised this money (cancellation, dispute) and did
    // not get it; Stripe returns any reversed amount to the platform
    // balance. Needs a human: logged at error level for alerting.
    logError({
      event: "refund.failed_needs_attention",
      error: new Error(`Refund ${providerRefundId} ended as ${providerStatus}`),
      refund_id: refund.id,
      payment_id: refund.paymentId,
      amount_cents: refund.amountCents,
    });
  }

  await recordAudit({
    event: "refund.outcome_applied",
    organizationId: refund?.payment.organizationId ?? null,
    metadata: { providerRefundId, status, paymentId: refund?.paymentId },
  });
}
