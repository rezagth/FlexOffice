import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * C5 — the platform endpoint and the "Connect" endpoint of Stripe sign with
 * different secrets. An event signed by either is accepted, anything else is
 * rejected, and the connected account is carried through.
 */

const constructEvent = vi.fn((_raw: string, _signature: string, secret: string) => {
  if (secret === "whsec_platform") return { id: "evt_p", type: "transfer.reversed", data: { object: { id: "tr_1" } } };
  if (secret === "whsec_connect") {
    return { id: "evt_c", type: "payout.failed", data: { object: { id: "po_1" } }, account: "acct_1" };
  }
  throw new Error("bad signature");
});

vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEvent };
  },
}));

const { StripePaymentProvider } = await import("@/server/domains/payments/stripe-provider");

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_platform");
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "");
  constructEvent.mockClear();
});

describe("verifyWebhookEvent", () => {
  it("rejects a request without a signature header", () => {
    expect(() => new StripePaymentProvider().verifyWebhookEvent("{}", null)).toThrow();
  });

  it("accepts the platform secret", () => {
    const event = new StripePaymentProvider().verifyWebhookEvent("{}", "sig");
    expect(event).toEqual({ id: "evt_p", type: "transfer.reversed", data: { id: "tr_1" } });
  });

  it("rejects an event signed with the Connect secret while none is configured", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_other");
    expect(() => new StripePaymentProvider().verifyWebhookEvent("{}", "sig")).toThrow();
  });

  it("accepts the Connect secret once configured, and carries the connected account", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_other");
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_connect");
    const event = new StripePaymentProvider().verifyWebhookEvent("{}", "sig");
    expect(event).toEqual({ id: "evt_c", type: "payout.failed", data: { id: "po_1" }, account: "acct_1" });
  });

  it("rejects a signature matching neither secret", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_other");
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_other2");
    expect(() => new StripePaymentProvider().verifyWebhookEvent("{}", "sig")).toThrow("Invalid Stripe webhook signature");
  });
});
