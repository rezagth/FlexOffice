import type { PaymentProvider } from "./provider";
import { MockPaymentProvider } from "./mock-provider";
import { StripePaymentProvider } from "./stripe-provider";

let cached: PaymentProvider | undefined;

/** Selected via PAYMENT_PROVIDER=mock|stripe — defaults to mock so the app
 * runs before Stripe Connect keys exist. */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  const kind = process.env.PAYMENT_PROVIDER || "mock";
  cached = kind === "stripe" ? new StripePaymentProvider() : new MockPaymentProvider();
  return cached;
}
