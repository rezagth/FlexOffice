import { collectPaymentConfigProblems } from "@/server/config/deployment-config";
import { ServiceUnavailableError } from "@/server/lib/errors";
import { logError } from "@/server/lib/logger";
import type { PaymentProvider } from "./provider";
import { MockPaymentProvider } from "./mock-provider";
import { StripePaymentProvider } from "./stripe-provider";

let cached: PaymentProvider | undefined;
let refusalReported = false;

/**
 * Selected via PAYMENT_PROVIDER=mock|stripe.
 *
 * Outside a production deployment it defaults to mock, so `pnpm dev`, the
 * tests and a declared demo run with no Stripe keys. In a production
 * deployment there is no default any more: a missing or incomplete payment
 * configuration makes this throw a 503, so booking and payment routes
 * refuse to work instead of silently "confirming" unpaid bookings — every
 * other page keeps working (see deployment-config.ts).
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;

  const problems = collectPaymentConfigProblems();
  if (problems.length > 0) {
    if (!refusalReported) {
      refusalReported = true;
      logError({
        event: "payments.provider_refused_misconfigured",
        error: new Error(problems.map((p) => p.message).join(" ")),
        keys: problems.map((p) => p.key),
      });
    }
    throw new ServiceUnavailableError("Le paiement est momentanément indisponible.");
  }

  const kind = process.env.PAYMENT_PROVIDER || "mock";
  cached = kind === "stripe" ? new StripePaymentProvider() : new MockPaymentProvider();
  return cached;
}

/** Test-only: forget the cached provider and the once-per-process log guard. */
export function resetPaymentProviderForTests() {
  cached = undefined;
  refusalReported = false;
}
