/**
 * Abstraction over the payment provider so the rest of the app (webhook
 * handling, future checkout/refund logic) never talks to a specific SDK
 * directly. Swappable via PAYMENT_PROVIDER — "mock" today, "stripe" once
 * real Stripe Connect keys are available. See getPaymentProvider().
 */
export type VerifiedWebhookEvent = {
  /** Provider-assigned id — the idempotency key stored in WebhookEvent. */
  id: string;
  type: string;
  data: unknown;
};

export interface PaymentProvider {
  readonly name: string;
  /** HTTP header carrying the signature, e.g. "stripe-signature". */
  readonly signatureHeaderName: string;
  /** Verifies the webhook signature and returns the parsed event.
   * Throws on an invalid/forged signature — callers must reject with 400. */
  verifyWebhookEvent(rawBody: string, signatureHeader: string | null): VerifiedWebhookEvent;
}
