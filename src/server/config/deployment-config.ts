import { isDemoModeRequested, isProductionDeployment } from "@/server/auth/runtime-config";

/**
 * Production configuration checks.
 *
 * Every integration in this app has a zero-config default (mock payments,
 * logged-only e-mails) so a demo deploy stays browsable. That contract is
 * right for a demo and dangerous for a real deployment: one forgotten
 * variable in Coolify and the platform "confirms" bookings nobody paid
 * for, behind a webhook secret printed in the source code.
 *
 * The checks below only apply to a production deployment (NODE_ENV=
 * production, OFFICEFLEX_DEMO_MODE not "true"). They never take the whole
 * site down: payment-related problems make the payment provider refuse to
 * start (booking routes answer 503, every other page keeps working), the
 * rest is reported at error level on every boot — see instrumentation.ts.
 */

export type ConfigProblem = {
  key: string;
  /** "payment" problems block the payment provider; "other" are reported only. */
  area: "payment" | "other";
  message: string;
};

/** Minimum length for a webhook shared secret we accept in production. */
export const MIN_WEBHOOK_SECRET_LENGTH = 32;

function env(name: string): string | undefined {
  // `||` not `??`: "" must mean "not configured" (see runtime-config.ts).
  return process.env[name] || undefined;
}

function paymentProblems(): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const kind = env("PAYMENT_PROVIDER");

  if (!kind) {
    problems.push({
      key: "PAYMENT_PROVIDER",
      area: "payment",
      message:
        "PAYMENT_PROVIDER must be set explicitly in production (\"stripe\", or \"mock\" for a staging environment). It no longer defaults to mock.",
    });
    return problems;
  }

  if (kind !== "stripe" && kind !== "mock") {
    problems.push({
      key: "PAYMENT_PROVIDER",
      area: "payment",
      message: `PAYMENT_PROVIDER="${kind}" is not a known provider (expected "stripe" or "mock").`,
    });
    return problems;
  }

  if (kind === "stripe") {
    for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]) {
      if (!env(key)) {
        problems.push({ key, area: "payment", message: `${key} is required when PAYMENT_PROVIDER=stripe.` });
      }
    }
  }

  if (kind === "mock") {
    const secret = env("PAYMENT_MOCK_WEBHOOK_SECRET");
    if (!secret || secret.length < MIN_WEBHOOK_SECRET_LENGTH) {
      problems.push({
        key: "PAYMENT_MOCK_WEBHOOK_SECRET",
        area: "payment",
        message: `PAYMENT_PROVIDER=mock in production requires PAYMENT_MOCK_WEBHOOK_SECRET of at least ${MIN_WEBHOOK_SECRET_LENGTH} random characters — otherwise anyone can forge a "payment succeeded" webhook.`,
      });
    }
  }

  return problems;
}

function otherProblems(): ConfigProblem[] {
  const problems: ConfigProblem[] = [];

  const email = env("EMAIL_PROVIDER");
  if (!email || email === "log") {
    problems.push({
      key: "EMAIL_PROVIDER",
      area: "other",
      message:
        "EMAIL_PROVIDER is not \"resend\": no transactional e-mail is actually sent (booking confirmations, access instructions…).",
    });
  } else if (email === "resend") {
    if (!env("RESEND_API_KEY")) {
      problems.push({ key: "RESEND_API_KEY", area: "other", message: "RESEND_API_KEY is required when EMAIL_PROVIDER=resend." });
    }
    const from = env("EMAIL_FROM");
    if (!from || from.includes("@resend.dev")) {
      problems.push({
        key: "EMAIL_FROM",
        area: "other",
        message: "EMAIL_FROM must use a domain verified in Resend — the resend.dev sandbox only delivers to the account owner.",
      });
    }
  }

  if (!env("CRON_SECRET")) {
    problems.push({
      key: "CRON_SECRET",
      area: "other",
      message: "CRON_SECRET is not set: /api/internal/expire-bookings refuses every call, so stale booking requests never expire.",
    });
  }

  if (!env("APP_URL")) {
    problems.push({
      key: "APP_URL",
      area: "other",
      message:
        "APP_URL is not set: behind a reverse proxy, browser requests may be refused by the CSRF origin check, and links built for e-mails and Stripe have no reliable base URL.",
    });
  }

  if (!env("TRUSTED_CLIENT_IP_HEADER") && env("VERCEL") !== "1") {
    problems.push({
      key: "TRUSTED_CLIENT_IP_HEADER",
      area: "other",
      message:
        "TRUSTED_CLIENT_IP_HEADER is not set: per-IP rate limits are keyed on x-forwarded-for, which the client controls. Behind Cloudflare, set it to cf-connecting-ip.",
    });
  }

  if (!env("RATE_LIMIT_KEY_SALT")) {
    problems.push({
      key: "RATE_LIMIT_KEY_SALT",
      area: "other",
      message: "RATE_LIMIT_KEY_SALT is not set: hashed e-mails in rate-limit keys use a public default salt.",
    });
  }

  return problems;
}

/** Empty outside a production deployment. */
export function collectProductionConfigProblems(): ConfigProblem[] {
  if (!isProductionDeployment()) return [];
  return [...paymentProblems(), ...otherProblems()];
}

export function collectPaymentConfigProblems(): ConfigProblem[] {
  if (!isProductionDeployment()) return [];
  return paymentProblems();
}

/**
 * The mock provider's webhook secret. Outside production it keeps the
 * well-known local default so `pnpm dev` and the test suites work with no
 * setup. In production — demo or not — there is no default: the secret
 * must be configured and long enough, or every mock webhook is rejected.
 */
export function getMockWebhookSecret(): string | null {
  const configured = env("PAYMENT_MOCK_WEBHOOK_SECRET");
  if (process.env.NODE_ENV !== "production") return configured ?? "mock-secret";
  if (!configured || configured.length < MIN_WEBHOOK_SECRET_LENGTH) return null;
  return configured;
}

/** For the boot log: which integrations this process will actually use. */
export function describeActiveIntegrations() {
  return {
    payment_provider: env("PAYMENT_PROVIDER") ?? (isProductionDeployment() ? "unset" : "mock (default)"),
    email_provider: env("EMAIL_PROVIDER") ?? "log (default)",
    demo_mode: isDemoModeRequested(),
    production_deployment: isProductionDeployment(),
  };
}
