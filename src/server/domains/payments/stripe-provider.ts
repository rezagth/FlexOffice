import Stripe from "stripe";
import { ValidationError } from "@/server/lib/errors";
import type {
  CapturePaymentOutcome,
  CreatePaymentIntentParams,
  PaymentProvider,
  VerifiedWebhookEvent,
} from "./provider";

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
    this.stripe = new Stripe(secretKey);
    this.webhookSecret = webhookSecret;
  }

  async createPaymentIntent(
    params: CreatePaymentIntentParams
  ): Promise<{ providerPaymentIntentId: string; clientSecret?: string }> {
    // capture_method: "manual" — authorize now, capture only once the
    // partner accepts the request (see accept-reject.ts). Connect payout:
    // when the organization has completed onboarding, the commission stays
    // on the platform account and the rest transfers to the connected
    // account directly on capture.
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: "eur",
      capture_method: "manual",
      metadata: { bookingId: params.bookingId },
      automatic_payment_methods: { enabled: true },
      ...(params.connectedAccountId
        ? { transfer_data: { destination: params.connectedAccountId } }
        : {}),
    });
    // client_secret is only absent if Stripe created the intent without
    // confirmation being possible at all, which does not happen for a
    // freshly created intent — the `?? undefined` is type hygiene, not a
    // real branch.
    return { providerPaymentIntentId: intent.id, clientSecret: intent.client_secret ?? undefined };
  }

  async capturePaymentIntent(providerPaymentIntentId: string): Promise<CapturePaymentOutcome> {
    await this.stripe.paymentIntents.capture(providerPaymentIntentId);
    // Never trust the synchronous response as final — see provider.ts.
    // The Payment/Booking transition only happens when
    // payment_intent.succeeded arrives through the verified webhook.
    return { outcome: "processing" };
  }

  async cancelPaymentIntent(providerPaymentIntentId: string): Promise<CapturePaymentOutcome> {
    await this.stripe.paymentIntents.cancel(providerPaymentIntentId);
    return { outcome: "processing" };
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
