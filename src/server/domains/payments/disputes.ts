import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { logEvent } from "@/server/lib/logger";
import type { StripeDisputeStatus } from "@/generated/prisma/client";
import { notifyChargebackReceived } from "@/server/domains/notifications/send-notifications";

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
 * Lifecycle order of a Stripe dispute. An inquiry (warning_*) may escalate
 * to a chargeback; a chargeback only moves forward; the outcomes are final.
 * A status may only be replaced by one of a strictly higher rank.
 */
export const DISPUTE_STATUS_RANK: Record<StripeDisputeStatus, number> = {
  WARNING_NEEDS_RESPONSE: 0,
  WARNING_UNDER_REVIEW: 1,
  NEEDS_RESPONSE: 2,
  UNDER_REVIEW: 3,
  WARNING_CLOSED: 4,
  CHARGE_REFUNDED: 4,
  WON: 4,
  LOST: 4,
};

/** Stored statuses that `next` may overwrite — never a final one, never a
 * later stage. */
export function statusesThatMayMoveTo(next: StripeDisputeStatus): StripeDisputeStatus[] {
  return (Object.keys(DISPUTE_STATUS_RANK) as StripeDisputeStatus[]).filter(
    (current) => DISPUTE_STATUS_RANK[current] < DISPUTE_STATUS_RANK[next]
  );
}

/** Where an administrator answers a chargeback: the Stripe dashboard, in
 * test or live mode depending on the configured key. */
export function stripeDashboardDisputeUrl(providerDisputeId: string): string {
  const testMode = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
  return `https://dashboard.stripe.com/${testMode ? "test/" : ""}disputes/${encodeURIComponent(providerDisputeId)}`;
}

/**
 * Records a real Stripe chargeback for visibility, and alerts the landlord
 * and the platform operators by e-mail when it is first seen. The platform absorbs chargeback losses (confirmed business
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

  // First delivery creates the row. A P2002 means another delivery (or a
  // retry of this one) created it first: fall through to the update path.
  let createdId: string | null = null;
  try {
    const created = await prisma.stripeDispute.create({
      data: {
        paymentId: payment.id,
        providerDisputeId: dispute.id,
        status,
        reason: dispute.reason,
        amountCents: dispute.amount,
      },
    });
    createdId = created.id;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }

  if (createdId) {
    await recordAudit({
      event: "stripe_dispute.created",
      organizationId: payment.organizationId,
      metadata: { paymentId: payment.id, providerDisputeId: dispute.id, status },
    });
    // Only on creation: retries and later updates must not re-alert.
    await notifyChargebackReceived(createdId);
    return;
  }

  // Never downgrade: Stripe does not guarantee delivery order, so an old
  // "needs_response" arriving after "won" must not reopen the dispute. The
  // update is conditional on the stored status being one that may move to
  // the new one — read and write are a single statement, so two concurrent
  // deliveries cannot interleave between a check and a write.
  const updated = await prisma.stripeDispute.updateMany({
    where: { providerDisputeId: dispute.id, status: { in: statusesThatMayMoveTo(status) } },
    data: { status },
  });
  if (updated.count === 0) {
    logEvent({ event: "stripe_dispute.stale_status_ignored", provider_dispute_id: dispute.id, status });
    return;
  }

  await recordAudit({
    event: "stripe_dispute.updated",
    organizationId: payment.organizationId,
    metadata: { paymentId: payment.id, providerDisputeId: dispute.id, status },
  });
}
