import { timingSafeEqual } from "node:crypto";
import { getMockWebhookSecret } from "@/server/config/deployment-config";
import { ValidationError } from "@/server/lib/errors";
import type {
  CancellationReason,
  CapturePaymentOutcome,
  CreatePaymentIntentParams,
  CreatePaymentIntentResult,
  CreateTransferParams,
  TransferResult,
  PaymentProvider,
  RefundOutcome,
  RefundParams,
  VerifiedWebhookEvent,
} from "./provider";

/**
 * Local/dev stand-in for Stripe. Signature check is a simple shared-secret
 * comparison (PAYMENT_MOCK_WEBHOOK_SECRET) rather than real HMAC — good
 * enough for exercising the idempotency/webhook plumbing before Stripe
 * Connect keys exist, not a substitute for signature verification once
 * real payments are wired up.
 *
 * Unlike Stripe, this provider has no external system to wait on: capture
 * and cancel are its own final word, so they resolve "succeeded"
 * synchronously instead of waiting for a webhook that will never arrive.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  readonly signatureHeaderName = "x-mock-signature";

  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<CreatePaymentIntentResult> {
    void params;
    // No card step: the mock authorizes synchronously, so the booking goes
    // straight to PENDING (see create-booking.ts).
    return { providerPaymentIntentId: `mock_pi_${crypto.randomUUID()}`, requiresClientConfirmation: false };
  }

  async assertConnectedAccountCanBeCharged(connectedAccountId: string | null): Promise<void> {
    // No Connect in the mock: every landlord is payable.
    void connectedAccountId;
  }

  async capturePaymentIntent(providerPaymentIntentId: string): Promise<CapturePaymentOutcome> {
    void providerPaymentIntentId;
    return { outcome: "succeeded" };
  }

  async cancelPaymentIntent(
    providerPaymentIntentId: string,
    reason: CancellationReason
  ): Promise<CapturePaymentOutcome> {
    void providerPaymentIntentId;
    void reason;
    return { outcome: "succeeded" };
  }

  async createTransfer(params: CreateTransferParams): Promise<TransferResult> {
    void params;
    return { providerTransferId: `mock_tr_${crypto.randomUUID()}` };
  }

  async refundPayment(params: RefundParams): Promise<RefundOutcome> {
    // Same bookkeeping as Stripe (the landlord bears the refunded amount;
    // the fee is refunded only for LANDLORD_AND_FEE), settled immediately.
    return {
      providerRefundId: `mock_re_${crypto.randomUUID()}`,
      outcome: "succeeded",
      reversedFromLandlord: true,
      applicationFeeRefunded: params.funding === "LANDLORD_AND_FEE",
    };
  }

  verifyWebhookEvent(rawBody: string, signatureHeader: string | null): VerifiedWebhookEvent {
    // No hard-coded fallback in production: the old default ("mock-secret")
    // was printed in this file and in .env.example, so anyone could forge a
    // "payment succeeded" event. See getMockWebhookSecret().
    const expected = getMockWebhookSecret();
    if (!expected || !signatureHeader || !constantTimeEqual(signatureHeader, expected)) {
      throw new ValidationError("Invalid mock webhook signature");
    }

    let parsed: { id?: string; type?: string; data?: unknown };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new ValidationError("Invalid webhook payload");
    }

    if (!parsed.id || !parsed.type) {
      throw new ValidationError("Missing id or type in webhook payload");
    }

    return { id: parsed.id, type: parsed.type, data: parsed.data };
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
