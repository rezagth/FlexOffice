import { timingSafeEqual } from "node:crypto";
import { getMockWebhookSecret } from "@/server/config/deployment-config";
import { ValidationError } from "@/server/lib/errors";
import type {
  CapturePaymentOutcome,
  CreatePaymentIntentParams,
  PaymentProvider,
  RefundOutcome,
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

  async createPaymentIntent(
    params: CreatePaymentIntentParams
  ): Promise<{ providerPaymentIntentId: string }> {
    void params;
    return { providerPaymentIntentId: `mock_pi_${crypto.randomUUID()}` };
  }

  async capturePaymentIntent(providerPaymentIntentId: string): Promise<CapturePaymentOutcome> {
    void providerPaymentIntentId;
    return { outcome: "succeeded" };
  }

  async cancelPaymentIntent(providerPaymentIntentId: string): Promise<CapturePaymentOutcome> {
    void providerPaymentIntentId;
    return { outcome: "succeeded" };
  }

  async refundPaymentIntent(
    providerPaymentIntentId: string,
    amountCents: number
  ): Promise<RefundOutcome> {
    void providerPaymentIntentId;
    void amountCents;
    return { providerRefundId: `mock_re_${crypto.randomUUID()}`, outcome: "succeeded" };
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
