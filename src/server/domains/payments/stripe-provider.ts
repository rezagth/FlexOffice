import Stripe from "stripe";
import { ConflictError, ValidationError } from "@/server/lib/errors";
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
    // Charge on the PLATFORM account, no destination (decided 10/10/2026):
    // the money stays with the platform until the stay is over, then a
    // payout (domains/payouts) transfers the landlord's share, net of the
    // commission, on the schedule the landlord chose. Before that date a
    // refund simply reduces what will be paid out; nothing has to be taken
    // back from a connected account. `transfer_group` ties the later
    // transfer to this booking in the Stripe Dashboard.
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: "eur",
        capture_method: "manual",
        metadata: { bookingId: params.bookingId },
        automatic_payment_methods: { enabled: true },
        transfer_group: `booking:${params.bookingId}`,
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

  async createTransfer(params: CreateTransferParams): Promise<TransferResult> {
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
      throw new Error("A transfer amount must be a positive integer number of cents");
    }
    const transfer = await this.stripe.transfers.create(
      {
        amount: params.amountCents,
        currency: "eur",
        destination: params.connectedAccountId,
        description: params.description,
        metadata: { payout_row_id: params.idempotencyKey },
      },
      // Same key on every retry: Stripe returns the transfer it already made.
      { idempotencyKey: `payout:${params.idempotencyKey}` }
    );
    return { providerTransferId: transfer.id };
  }

  async refundPayment(params: RefundParams): Promise<RefundOutcome> {
    // Since 10/10/2026 the charge sits on the platform account, so there is
    // no transfer to reverse: the refund just leaves the platform balance
    // and reduces what the landlord will be paid. A legacy destination
    // charge (made before that date) still reverses its transfer.
    const intent = await this.stripe.paymentIntents.retrieve(params.providerPaymentIntentId);
    const hasTransfer = Boolean(intent.transfer_data?.destination);
    const refundFee = params.funding === "LANDLORD_AND_FEE" && Boolean(intent.application_fee_amount);
    // Held on the platform: the commission is "refunded" in our ledger (the
    // landlord's share is cancelled and the whole price goes back to the
    // client) without any provider-side fee to refund.
    const heldOnPlatform = !hasTransfer;

    // Legacy destination charge only: `reverse_transfer` takes back exactly
    // the refunded amount from the landlord and `refund_application_fee`
    // gives the commission back.
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
      reversedFromLandlord: hasTransfer || heldOnPlatform,
      applicationFeeRefunded: refundFee || (heldOnPlatform && params.funding === "LANDLORD_AND_FEE"),
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
