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
  /** The platform's commission, computed server-side
   * (computeCommissionCents). Collected as the Stripe application fee: the
   * connected account receives `amountCents - applicationFeeCents`. */
  applicationFeeCents: number;
  /** Organization.stripeAccountId — the connected account that will
   * eventually receive the transfer, net of the platform's commission.
   * Ignored by providers that don't support Connect yet. */
  connectedAccountId?: string | null;
  /** The client's email, so Stripe emails its own hosted receipt on capture.
   * Ignored by providers that don't support it (the mock has no receipt). */
  receiptEmail?: string | null;
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

export type CreatePaymentIntentResult = {
  providerPaymentIntentId: string;
  /** Only meaningful for a provider whose browser step collects a card. */
  clientSecret?: string;
  /**
   * True when the client still has to confirm a card in the browser before
   * the amount is authorized (real Stripe): the booking waits in
   * AWAITING_PAYMENT until `payment_intent.amount_capturable_updated`.
   * False when the provider authorizes synchronously (the mock).
   */
  requiresClientConfirmation: boolean;
};

/** Why an authorization is released — forwarded to Stripe as
 * `cancellation_reason` and read back from the `payment_intent.canceled`
 * event, so the right e-mail goes out whichever path finalizes it. */
export type CancellationReason =
  /** Landlord declined the request (no Stripe reason). */
  | "declined"
  /** The client cancelled before acceptance. */
  | "requested_by_customer"
  /** Expired: no landlord answer in time, or the card step was abandoned. */
  | "abandoned";

/**
 * Who funds a refund (decided 06/10/2026):
 * - LANDLORD: the refunded amount is taken back from the landlord's
 *   transfer; the platform keeps its commission. Used for client
 *   cancellations and partial dispute refunds. The amount can never
 *   exceed what the landlord received.
 * - LANDLORD_AND_FEE: full refund; the landlord's share is taken back and
 *   the platform refunds its own commission. Used when the landlord
 *   cancels, and for a full dispute refund.
 */
export type RefundFunding = "LANDLORD" | "LANDLORD_AND_FEE";

export type RefundParams = {
  providerPaymentIntentId: string;
  amountCents: number;
  funding: RefundFunding;
  /** Stable per refund (our Refund row id): a retried call never refunds twice. */
  idempotencyKey: string;
};

export type RefundOutcome = {
  /** Provider-assigned id for this refund — stored on Refund.providerRefundId,
   * and the key a later refund webhook event uses to find the row again. */
  providerRefundId: string;
  /** Same succeeded/processing split as CapturePaymentOutcome: the mock is
   * its own authority, real Stripe refunds are only final once a verified
   * `refund.updated`/`charge.refunded` webhook event confirms it. */
  outcome: "succeeded" | "processing";
  /** How much was actually taken back from the landlord — 0 when the
   * payment had no transfer to reverse (legacy, pre-Connect payment). */
  landlordReversalCents: number;
  applicationFeeRefunded: boolean;
};

export interface PaymentProvider {
  readonly name: string;
  /** HTTP header carrying the signature, e.g. "stripe-signature". */
  readonly signatureHeaderName: string;

  /** Verifies the webhook signature and returns the parsed event.
   * Throws on an invalid/forged signature — callers must reject with 400. */
  verifyWebhookEvent(rawBody: string, signatureHeader: string | null): VerifiedWebhookEvent;

  /** Authorizes (but does not capture) a payment for a booking request.
   * Returns the provider's payment intent id, stored on Payment.
   * `clientSecret` is only meaningful for a provider that needs the
   * browser to actually collect and confirm a card (real Stripe) — the
   * mock provider has no card step, so it returns none. */
  createPaymentIntent(params: CreatePaymentIntentParams): Promise<CreatePaymentIntentResult>;

  /** Throws a ConflictError when the landlord's connected account cannot
   * receive this payment yet (no account, onboarding unfinished, charges or
   * payouts disabled). Called before a booking is created, so money is
   * never taken for a landlord who cannot be paid. No-op for the mock. */
  assertConnectedAccountCanBeCharged(connectedAccountId: string | null): Promise<void>;

  /** Captures a previously-authorized payment intent — called when a
   * partner accepts a booking request. */
  capturePaymentIntent(providerPaymentIntentId: string): Promise<CapturePaymentOutcome>;

  /** Releases a previously-authorized payment intent without charging the
   * client — called when a partner rejects a booking request, or when a
   * stale request auto-expires. */
  cancelPaymentIntent(
    providerPaymentIntentId: string,
    reason: CancellationReason
  ): Promise<CapturePaymentOutcome>;

  /** Refunds part or all of a captured payment intent. `amountCents` and
   * `funding` are always decided server-side (see payments/refunds.ts),
   * never taken from a request. */
  refundPayment(params: RefundParams): Promise<RefundOutcome>;
}
