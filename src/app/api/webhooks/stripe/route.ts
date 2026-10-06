import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { getPaymentProvider } from "@/server/domains/payments/get-payment-provider";
import { applyPaymentOutcome } from "@/server/domains/payments/apply-outcome";
import { applyRefundOutcome } from "@/server/domains/payments/apply-refund-outcome";
import { applyAuthorization } from "@/server/domains/bookings/payment-holds";
import type { CancellationReason } from "@/server/domains/payments/provider";
import {
  recordDisputeEvent,
  type StripeDisputeEventData,
} from "@/server/domains/payments/disputes";
import { logEvent } from "@/server/lib/logger";
import { withErrorHandling } from "@/server/lib/http";

// POST /api/webhooks/stripe
// Auth: none — authenticity comes from the provider signature, not a
// session. Never trust this payload before verifyWebhookEvent() passes.
//
// This is the only place a real Stripe payment ever becomes "succeeded":
// applyPaymentOutcome() is never called synchronously from a route for
// the stripe provider, only from here, once the signature is verified.
export const POST = withErrorHandling(async (request: Request) => {
  const provider = getPaymentProvider();
  const rawBody = await request.text();
  const signature = request.headers.get(provider.signatureHeaderName);

  const event = provider.verifyWebhookEvent(rawBody, signature);
  let duplicate = false;

  try {
    await prisma.webhookEvent.create({
      data: {
        provider: provider.name,
        providerEventId: event.id,
        type: event.type,
        payload: event.data as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Provider retried a delivery we already recorded. The ledger write
      // is a no-op, but applyPaymentOutcome() is dispatched below anyway —
      // it is itself idempotent (conditional on current status), so
      // running it again is always safe and covers the case where the
      // first delivery was recorded but the process crashed before
      // applying it.
      duplicate = true;
      logEvent({ event: "webhook.duplicate_ignored", providerEventId: event.id });
    } else {
      throw error;
    }
  }

  if (!duplicate) {
    logEvent({ event: "webhook.received", providerEventId: event.id, type: event.type });
  }

  if (event.type.startsWith("charge.dispute.")) {
    await dispatchDispute(event.data);
  } else if (event.type === "refund.updated" || event.type === "refund.created") {
    await dispatchRefund(event.data);
  } else {
    await dispatchOutcome(event.type, event.data);
  }

  return NextResponse.json({ received: true, ...(duplicate ? { duplicate: true } : {}) });
});

function extractPaymentIntentId(data: unknown): string | null {
  if (data && typeof data === "object" && "id" in data && typeof (data as { id: unknown }).id === "string") {
    return (data as { id: string }).id;
  }
  return null;
}

function isStripeDisputeEventData(data: unknown): data is StripeDisputeEventData {
  return (
    !!data &&
    typeof data === "object" &&
    "id" in data &&
    "reason" in data &&
    "status" in data &&
    "amount" in data
  );
}

async function dispatchDispute(data: unknown) {
  if (!isStripeDisputeEventData(data)) {
    logEvent({ event: "webhook.malformed_dispute_payload" });
    return;
  }
  await recordDisputeEvent(data);
}

function isStripeRefundEventData(data: unknown): data is { id: string; status: string } {
  return (
    !!data &&
    typeof data === "object" &&
    "id" in data &&
    typeof (data as { id: unknown }).id === "string" &&
    "status" in data &&
    typeof (data as { status: unknown }).status === "string"
  );
}

async function dispatchRefund(data: unknown) {
  if (!isStripeRefundEventData(data)) {
    logEvent({ event: "webhook.malformed_refund_payload" });
    return;
  }
  const metadata = (data as { metadata?: unknown }).metadata;
  const refundRowId =
    metadata && typeof metadata === "object" && typeof (metadata as { refund_row_id?: unknown }).refund_row_id === "string"
      ? (metadata as { refund_row_id: string }).refund_row_id
      : null;
  await applyRefundOutcome(data.id, data.status, refundRowId);
}

function extractCancellationReason(data: unknown): CancellationReason {
  const reason =
    data && typeof data === "object" && "cancellation_reason" in data
      ? (data as { cancellation_reason: unknown }).cancellation_reason
      : null;
  // We only ever set these two; anything else (unset, or a reason Stripe
  // set itself) is treated as a landlord refusal / plain release.
  return reason === "abandoned" || reason === "requested_by_customer" ? reason : "declined";
}

async function dispatchOutcome(type: string, data: unknown) {
  const providerPaymentIntentId = extractPaymentIntentId(data);

  // The card is authorized: the hold becomes a real request (B-03). The
  // only event that may do so — never the browser's own confirmation.
  if (type === "payment_intent.amount_capturable_updated") {
    if (!providerPaymentIntentId) {
      logEvent({ event: "webhook.missing_intent_id", type });
      return;
    }
    await applyAuthorization(providerPaymentIntentId);
    return;
  }

  const outcome =
    type === "payment_intent.succeeded"
      ? "captured"
      : type === "payment_intent.payment_failed"
        ? "failed"
        : type === "payment_intent.canceled"
          ? "canceled"
          : null;

  if (!outcome) {
    logEvent({ event: "webhook.unhandled_type", type });
    return;
  }

  if (!providerPaymentIntentId) {
    logEvent({ event: "webhook.missing_intent_id", type });
    return;
  }

  await applyPaymentOutcome(
    providerPaymentIntentId,
    outcome,
    outcome === "canceled" ? extractCancellationReason(data) : null
  );
}
