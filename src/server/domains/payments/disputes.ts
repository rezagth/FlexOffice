import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { logEvent } from "@/server/lib/logger";
import type { StripeDisputeStatus } from "@/generated/prisma/client";

/** Shape pulled from the Stripe Dispute object embedded in a
 * `charge.dispute.*` webhook event — see route.ts. Only the fields this
 * domain actually needs, not the full Stripe.Dispute type. */
export type StripeDisputeEventData = {
  id: string;
  payment_intent: string | null;
  amount: number;
  reason: string;
  status: string;
};

const STATUS_MAP: Record<string, StripeDisputeStatus> = {
  warning_needs_response: "WARNING_NEEDS_RESPONSE",
  warning_under_review: "WARNING_UNDER_REVIEW",
  warning_closed: "WARNING_CLOSED",
  needs_response: "NEEDS_RESPONSE",
  under_review: "UNDER_REVIEW",
  charge_refunded: "CHARGE_REFUNDED",
  won: "WON",
  lost: "LOST",
};

/**
 * Records a real Stripe chargeback for visibility — this is the only thing
 * it does. The platform absorbs chargeback losses (confirmed business
 * decision): no automatic `reverse_transfer` against the partner's Connect
 * balance, no booking/payment state change. Idempotent via
 * `providerDisputeId` — `charge.dispute.created/updated/closed` all funnel
 * through here, and Stripe can retry any of them.
 */
export async function recordDisputeEvent(dispute: StripeDisputeEventData) {
  const status = STATUS_MAP[dispute.status];
  if (!status) {
    logEvent({ event: "stripe_dispute.unknown_status", status: dispute.status });
    return;
  }

  if (!dispute.payment_intent) {
    logEvent({ event: "stripe_dispute.missing_payment_intent", provider_dispute_id: dispute.id });
    return;
  }

  const payment = await prisma.payment.findUnique({
    where: { providerPaymentIntentId: dispute.payment_intent },
  });
  if (!payment) {
    // Same reasoning as apply-outcome.ts: a dispute can arrive for an
    // intent this app never created (stale test event, different
    // integration). Log and move on rather than throw.
    logEvent({
      event: "stripe_dispute.unknown_payment_intent",
      provider_payment_intent_id: dispute.payment_intent,
    });
    return;
  }

  const existing = await prisma.stripeDispute.findUnique({
    where: { providerDisputeId: dispute.id },
  });

  await prisma.stripeDispute.upsert({
    where: { providerDisputeId: dispute.id },
    create: {
      paymentId: payment.id,
      providerDisputeId: dispute.id,
      status,
      reason: dispute.reason,
      amountCents: dispute.amount,
    },
    update: { status },
  });

  await recordAudit({
    event: existing ? "stripe_dispute.updated" : "stripe_dispute.created",
    organizationId: payment.organizationId,
    metadata: { paymentId: payment.id, providerDisputeId: dispute.id, status },
  });
}
