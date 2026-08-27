import Stripe from "stripe";
import { ValidationError } from "@/server/lib/errors";
import type { PaymentProvider, VerifiedWebhookEvent } from "./provider";

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
