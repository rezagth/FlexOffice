import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * C2 — no payment and no numbered invoice with real money while the
 * platform identity printed on the documents is still "[à compléter]".
 * Test mode, mock payments and development are never affected.
 */

const PLATFORM_KEYS = [
  "PLATFORM_LEGAL_NAME",
  "PLATFORM_LEGAL_FORM",
  "PLATFORM_SHARE_CAPITAL",
  "PLATFORM_ADDRESS",
  "PLATFORM_SIRET",
  "PLATFORM_RCS",
  "PLATFORM_VAT_NUMBER",
  "PLATFORM_BILLING_EMAIL",
];

function fillIdentity() {
  for (const key of PLATFORM_KEYS) vi.stubEnv(key, "renseigné");
}

async function load() {
  vi.resetModules();
  const invoicing = await import("@/server/domains/invoicing/config");
  const deployment = await import("@/server/config/deployment-config");
  const provider = await import("@/server/domains/payments/get-payment-provider");
  return { invoicing, deployment, provider };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const key of [
    "PAYMENT_PROVIDER",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "OFFICEFLEX_DEMO_MODE",
    ...PLATFORM_KEYS,
  ]) {
    vi.stubEnv(key, "");
  }
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function stripeEnv(secretKey: string) {
  vi.stubEnv("PAYMENT_PROVIDER", "stripe");
  vi.stubEnv("STRIPE_SECRET_KEY", secretKey);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_x");
}

describe("platform identity and live money", () => {
  it("blocks issuance and refuses the payment provider with a live key and an empty identity", async () => {
    stripeEnv("sk_live_x");
    const { invoicing, deployment, provider } = await load();

    expect(invoicing.isLiveMoneyMode()).toBe(true);
    expect(invoicing.isPlatformIdentityBlockingIssuance()).toBe(true);
    expect(deployment.collectPaymentConfigProblems().map((p) => p.key)).toContain("PLATFORM_*");
    expect(() => provider.getPaymentProvider()).toThrow();
  });

  it("names the missing variables, never their values", async () => {
    stripeEnv("sk_live_x");
    vi.stubEnv("PLATFORM_SIRET", "12345678900011");
    const { invoicing, deployment } = await load();

    const missing = invoicing.missingPlatformIdentityKeys();
    expect(missing).not.toContain("PLATFORM_SIRET");
    expect(missing).toContain("PLATFORM_LEGAL_NAME");
    const message = deployment.collectPaymentConfigProblems().find((p) => p.key === "PLATFORM_*")?.message ?? "";
    expect(message).toContain("PLATFORM_LEGAL_NAME");
    expect(message).not.toContain("12345678900011");
  });

  it("lets everything through once the identity is complete", async () => {
    stripeEnv("sk_live_x");
    fillIdentity();
    const { invoicing, deployment } = await load();

    expect(invoicing.isPlatformIdentityBlockingIssuance()).toBe(false);
    expect(deployment.collectPaymentConfigProblems()).toEqual([]);
  });

  it("does not block Stripe TEST mode: the recette runs with the placeholder identity", async () => {
    stripeEnv("sk_test_x");
    const { invoicing, deployment } = await load();

    expect(invoicing.isLiveMoneyMode()).toBe(false);
    expect(invoicing.isPlatformIdentityBlockingIssuance()).toBe(false);
    expect(deployment.collectPaymentConfigProblems()).toEqual([]);
  });

  it("does not block outside a production deployment", async () => {
    vi.stubEnv("NODE_ENV", "development");
    stripeEnv("sk_live_x");
    const { invoicing } = await load();

    expect(invoicing.isPlatformIdentityBlockingIssuance()).toBe(false);
  });
});
