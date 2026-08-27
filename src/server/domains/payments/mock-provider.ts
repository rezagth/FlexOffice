import { ValidationError } from "@/server/lib/errors";
import type { PaymentProvider, VerifiedWebhookEvent } from "./provider";

/**
 * Local/dev stand-in for Stripe. Signature check is a simple shared-secret
 * comparison (PAYMENT_MOCK_WEBHOOK_SECRET) rather than real HMAC — good
 * enough for exercising the idempotency/webhook plumbing before Stripe
 * Connect keys exist, not a substitute for signature verification once
 * real payments are wired up.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  readonly signatureHeaderName = "x-mock-signature";

  verifyWebhookEvent(rawBody: string, signatureHeader: string | null): VerifiedWebhookEvent {
    // `||`, not `??` — an unset env var can arrive as "" rather than
    // undefined depending on the environment (see logger.ts for the bug
    // this caused elsewhere); `??` would silently accept that empty value.
    const expected = process.env.PAYMENT_MOCK_WEBHOOK_SECRET || "mock-secret";
    if (signatureHeader !== expected) {
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
