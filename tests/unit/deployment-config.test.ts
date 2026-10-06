import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Production must never fall back silently to mock payments behind a
 * public webhook secret (audit 06/10/2026, B-07).
 */

const STRONG_SECRET = "x".repeat(40);

async function load() {
  vi.resetModules();
  const config = await import("@/server/config/deployment-config");
  const payments = await import("@/server/domains/payments/get-payment-provider");
  const { MockPaymentProvider } = await import("@/server/domains/payments/mock-provider");
  return { ...config, ...payments, MockPaymentProvider };
}

const MOCK_EVENT = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded", data: { id: "mock_pi_1" } });

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const key of [
    "PAYMENT_PROVIDER",
    "PAYMENT_MOCK_WEBHOOK_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "OFFICEFLEX_DEMO_MODE",
    "EMAIL_PROVIDER",
    "CRON_SECRET",
    "OFFICEFLEX_ALLOW_MOCK_PAYMENTS",
  ]) {
    vi.stubEnv(key, "");
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("outside production", () => {
  it("reports nothing and keeps the mock defaults for local development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { collectProductionConfigProblems, getPaymentProvider, getMockWebhookSecret } = await load();

    expect(collectProductionConfigProblems()).toEqual([]);
    expect(getPaymentProvider().constructor.name).toBe("MockPaymentProvider");
    expect(getMockWebhookSecret()).toBe("mock-secret");
  });
});

describe("in a production deployment", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it("refuses to start the payment provider when PAYMENT_PROVIDER is unset", async () => {
    const { getPaymentProvider, collectPaymentConfigProblems } = await load();

    expect(collectPaymentConfigProblems().map((p) => p.key)).toContain("PAYMENT_PROVIDER");
    expect(() => getPaymentProvider()).toThrow(
      expect.objectContaining({ code: "SERVICE_UNAVAILABLE", status: 503 })
    );
  });

  it("refuses stripe with missing keys", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "stripe");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    const { getPaymentProvider, collectPaymentConfigProblems } = await load();

    expect(collectPaymentConfigProblems().map((p) => p.key)).toEqual([
      "STRIPE_WEBHOOK_SECRET",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    ]);
    expect(() => getPaymentProvider()).toThrow(expect.objectContaining({ status: 503 }));
  });

  it("refuses mock payments without a strong webhook secret", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "mock");
    vi.stubEnv("PAYMENT_MOCK_WEBHOOK_SECRET", "mock-secret");
    const { getPaymentProvider } = await load();

    expect(() => getPaymentProvider()).toThrow(expect.objectContaining({ status: 503 }));
  });

  it("refuses mock payments without the explicit staging opt-in", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "mock");
    vi.stubEnv("PAYMENT_MOCK_WEBHOOK_SECRET", STRONG_SECRET);
    const { getPaymentProvider, collectPaymentConfigProblems } = await load();

    expect(collectPaymentConfigProblems().map((p) => p.key)).toEqual(["OFFICEFLEX_ALLOW_MOCK_PAYMENTS"]);
    expect(() => getPaymentProvider()).toThrow(expect.objectContaining({ status: 503 }));
  });

  it("accepts mock payments (staging) with the opt-in and a strong secret", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "mock");
    vi.stubEnv("OFFICEFLEX_ALLOW_MOCK_PAYMENTS", "true");
    vi.stubEnv("PAYMENT_MOCK_WEBHOOK_SECRET", STRONG_SECRET);
    const { getPaymentProvider } = await load();

    expect(getPaymentProvider().constructor.name).toBe("MockPaymentProvider");
  });

  it("rejects a mock webhook signed with the old public default", async () => {
    const { MockPaymentProvider } = await load();
    const provider = new MockPaymentProvider();

    expect(() => provider.verifyWebhookEvent(MOCK_EVENT, "mock-secret")).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR" })
    );
  });

  it("rejects mock webhooks even in demo mode when no strong secret is configured", async () => {
    vi.stubEnv("OFFICEFLEX_DEMO_MODE", "true");
    const { MockPaymentProvider } = await load();

    expect(() => new MockPaymentProvider().verifyWebhookEvent(MOCK_EVENT, "mock-secret")).toThrow();
  });

  it("accepts a mock webhook signed with the configured strong secret", async () => {
    vi.stubEnv("PAYMENT_MOCK_WEBHOOK_SECRET", STRONG_SECRET);
    const { MockPaymentProvider } = await load();

    expect(new MockPaymentProvider().verifyWebhookEvent(MOCK_EVENT, STRONG_SECRET).id).toBe("evt_1");
  });

  it("reports e-mail and cron gaps without blocking payments", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "mock");
    vi.stubEnv("OFFICEFLEX_ALLOW_MOCK_PAYMENTS", "true");
    vi.stubEnv("PAYMENT_MOCK_WEBHOOK_SECRET", STRONG_SECRET);
    const { collectProductionConfigProblems, collectPaymentConfigProblems } = await load();

    expect(collectPaymentConfigProblems()).toEqual([]);
    const keys = collectProductionConfigProblems().map((p) => p.key);
    expect(keys).toContain("EMAIL_PROVIDER");
    expect(keys).toContain("CRON_SECRET");
  });

  it("does not apply when the deployment is declared as a demo", async () => {
    vi.stubEnv("OFFICEFLEX_DEMO_MODE", "true");
    const { collectProductionConfigProblems, getPaymentProvider } = await load();

    expect(collectProductionConfigProblems()).toEqual([]);
    expect(getPaymentProvider().constructor.name).toBe("MockPaymentProvider");
  });
});

describe("public listings without a database", () => {
  async function loadListings() {
    vi.resetModules();
    return import("@/server/domains/spaces/list-spaces");
  }

  it("serve the demo listings outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "");
    const { listPublishedSpaces } = await loadListings();
    expect((await listPublishedSpaces()).length).toBeGreaterThan(0);
  });

  it("serve the demo listings in a declared demo", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OFFICEFLEX_DEMO_MODE", "true");
    vi.stubEnv("DATABASE_URL", "");
    const { listPublishedSpaces } = await loadListings();
    expect((await listPublishedSpaces()).length).toBeGreaterThan(0);
  });

  it("serve nothing — never made-up listings — in a real production deployment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    const { listPublishedSpaces, getPublishedSpaceBySlug } = await loadListings();
    expect(await listPublishedSpaces()).toEqual([]);
    expect(await getPublishedSpaceBySlug("salle-rivoli-paris")).toBeNull();
  });
});
