/**
 * Abstraction over the payment provider so the rest of the app (webhook
 * handling, booking checkout, refund logic) never talks to a specific SDK
 * directly. Swappable via PAYMENT_PROVIDER — "mock" today, "stripe" once
 * real Stripe Connect keys are available. See getPaymentProvider().
 */
export type VerifiedWebhookEvent = {
  /** Provider-assigned id — the idempotency key stored in WebhookEvent. */
  id: string;
  type: string;
  data: unknown;
};

export type CreatePaymentIntentParams = {
  bookingId: string;
  amountCents: number;
  /** Organization.stripeAccountId — the connected account that will
   * eventually receive the transfer, net of the platform's commission.
   * Ignored by providers that don't support Connect yet. */
  connectedAccountId?: string | null;
};

export type CapturePaymentOutcome = {
  /**
   * "succeeded" only when the provider is its own authority and the
   * transition is final immediately (the mock provider — there is no
   * external system to wait for). Real Stripe capture/cancel calls always
   * return "processing": the final state only ever comes from a verified
   * webhook event, never from the synchronous API response.
   */
  outcome: "succeeded" | "processing";
};

export interface PaymentProvider {
  readonly name: string;
  /** HTTP header carrying the signature, e.g. "stripe-signature". */
  readonly signatureHeaderName: string;

  /** Verifies the webhook signature and returns the parsed event.
   * Throws on an invalid/forged signature — callers must reject with 400. */
  verifyWebhookEvent(rawBody: string, signatureHeader: string | null): VerifiedWebhookEvent;

  /** Authorizes (but does not capture) a payment for a booking request.
   * Returns the provider's payment intent id, stored on Payment. */
  createPaymentIntent(
    params: CreatePaymentIntentParams
  ): Promise<{ providerPaymentIntentId: string }>;

  /** Captures a previously-authorized payment intent — called when a
   * partner accepts a booking request. */
  capturePaymentIntent(providerPaymentIntentId: string): Promise<CapturePaymentOutcome>;

  /** Releases a previously-authorized payment intent without charging the
   * client — called when a partner rejects a booking request, or when a
   * stale request auto-expires. */
  cancelPaymentIntent(providerPaymentIntentId: string): Promise<CapturePaymentOutcome>;
}
