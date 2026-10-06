import Stripe from "stripe";
import { ConflictError, ValidationError } from "@/server/lib/errors";
import type {
  CancellationReason,
  CapturePaymentOutcome,
  CreatePaymentIntentParams,
  CreatePaymentIntentResult,
  PaymentProvider,
  RefundOutcome,
  RefundParams,
  VerifiedWebhookEvent,
} from "./provider";
import { RefundDeclinedError } from "./provider";

/** Shown to the client when the landlord cannot be paid yet. */
const LANDLORD_NOT_PAYABLE =
  "Cet espace ne peut pas encore être réservé : l'entreprise qui le propose n'a pas terminé son inscription au paiement.";

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  readonly signatureHeaderName = "stripe-signature";
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secretKey || !webhookSecret) {
      throw new Error("STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be set");
    }
    // Pinned explicitly rather than left to the account's Dashboard default,
    // so a Dashboard-side default change can never silently alter request/
    // response behavior for this app (stripe-best-practices reference).
    this.stripe = new Stripe(secretKey, { apiVersion: "2026-08-26.dahlia" });
    this.webhookSecret = webhookSecret;
  }

  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<CreatePaymentIntentResult> {
    // Defence in depth: createBooking() already called
    // assertConnectedAccountCanBeCharged(). Without a destination the whole
    // amount would stay on the platform with no payout planned.
    if (!params.connectedAccountId) {
      throw new ConflictError(LANDLORD_NOT_PAYABLE);
    }
    if (
      !Number.isInteger(params.applicationFeeCents) ||
      params.applicationFeeCents < 0 ||
      params.applicationFeeCents > params.amountCents
    ) {
      throw new Error("applicationFeeCents must be an integer between 0 and amountCents");
    }

    // capture_method: "manual" — authorize now, capture only once the
    // landlord accepts the request (see accept-reject.ts).
    //
    // Destination charge with an application fee: Stripe transfers the full
    // amount to the landlord's connected account on capture, then collects
    // `application_fee_amount` (our commission) back to the platform. The
    // landlord nets `amount - fee`; the platform keeps the fee and pays the
    // Stripe processing fees out of it. Without `application_fee_amount`
    // (as before 06/10/2026) the landlord received 100% and the platform
    // nothing — while our ledger recorded a 15% commission.
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: "eur",
        capture_method: "manual",
        metadata: { bookingId: params.bookingId },
        automatic_payment_methods: { enabled: true },
        application_fee_amount: params.applicationFeeCents,
        transfer_data: { destination: params.connectedAccountId },
        ...(params.receiptEmail ? { receipt_email: params.receiptEmail } : {}),
      },
      // A retried POST /api/bookings for the same booking row must not
      // create a second intent.
      { idempotencyKey: `booking:${params.bookingId}:intent` }
    );
    return {
      providerPaymentIntentId: intent.id,
      clientSecret: intent.client_secret ?? undefined,
      requiresClientConfirmation: true,
    };
  }

  async assertConnectedAccountCanBeCharged(connectedAccountId: string | null): Promise<void> {
    if (!connectedAccountId) throw new ConflictError(LANDLORD_NOT_PAYABLE);
    const account = await this.stripe.accounts.retrieve(connectedAccountId);
    if (!account.charges_enabled || !account.payouts_enabled) {
      throw new ConflictError(LANDLORD_NOT_PAYABLE);
    }
  }

  async capturePaymentIntent(providerPaymentIntentId: string): Promise<CapturePaymentOutcome> {
    await this.stripe.paymentIntents.capture(providerPaymentIntentId);
    // Never trust the synchronous response as final — see provider.ts.
    // The Payment/Booking transition only happens when
    // payment_intent.succeeded arrives through the verified webhook.
    return { outcome: "processing" };
  }

  async cancelPaymentIntent(
    providerPaymentIntentId: string,
    reason: CancellationReason
  ): Promise<CapturePaymentOutcome> {
    // Stripe has no "declined by the merchant" reason; leaving it unset is
    // how the webhook tells a landlord refusal apart (see apply-outcome.ts).
    await this.stripe.paymentIntents.cancel(
      providerPaymentIntentId,
      reason === "declined" ? {} : { cancellation_reason: reason }
    );
    return { outcome: "processing" };
  }

  async refundPayment(params: RefundParams): Promise<RefundOutcome> {
    // A payment taken before Connect onboarding was enforced has no
    // transfer to reverse — refunding with reverse_transfer would fail, so
    // the platform bears that refund (and says so in the returned outcome).
    const intent = await this.stripe.paymentIntents.retrieve(params.providerPaymentIntentId);
    const hasTransfer = Boolean(intent.transfer_data?.destination);
    const refundFee = params.funding === "LANDLORD_AND_FEE" && Boolean(intent.application_fee_amount);

    // With a destination charge the full amount was transferred to the
    // landlord, so `reverse_transfer` takes back exactly the refunded
    // amount from them. `refund_application_fee` additionally gives the
    // commission back (landlord cancellation, full dispute refund).
    let refund: Stripe.Refund;
    try {
      refund = await this.stripe.refunds.create(
      {
        payment_intent: params.providerPaymentIntentId,
        amount: params.amountCents,
        ...(hasTransfer ? { reverse_transfer: true } : {}),
        ...(refundFee ? { refund_application_fee: true } : {}),
        // Lets the webhook find our Refund row even if refund.created arrives
        // before the synchronous answer has been stored (apply-refund-outcome.ts).
        metadata: { funding: params.funding, refund_row_id: params.idempotencyKey },
      },
      { idempotencyKey: `refund:${params.idempotencyKey}` }
      );
    } catch (error) {
      // A 4xx from Stripe is a definitive "no"; a network error or a 5xx
      // is not — Stripe may have refunded — so it is rethrown as is.
      if (error instanceof Stripe.errors.StripeInvalidRequestError || error instanceof Stripe.errors.StripeCardError) {
        throw new RefundDeclinedError(error.message);
      }
      throw error;
    }
    // Never trust the synchronous response as final — the Refund row only
    // moves to SUCCEEDED when a verified refund.updated webhook event
    // confirms it (see apply-refund-outcome.ts).
    return {
      providerRefundId: refund.id,
      outcome: "processing",
      reversedFromLandlord: hasTransfer,
      applicationFeeRefunded: refundFee,
    };
  }

  verifyWebhookEvent(rawBody: string, signatureHeader: string | null): VerifiedWebhookEvent {
    if (!signatureHeader) {
      throw new ValidationError("Missing Stripe-Signature header");
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signatureHeader,
        this.webhookSecret
      );
    } catch {
      throw new ValidationError("Invalid Stripe webhook signature");
    }
    return { id: event.id, type: event.type, data: event.data.object };
  }
}
