import { describe, expect, it } from "vitest";
import { MockPaymentProvider } from "@/server/domains/payments/mock-provider";

describe("MockPaymentProvider.refundPaymentIntent", () => {
  it("succeeds synchronously — the mock is its own authority, no webhook to wait for", async () => {
    const provider = new MockPaymentProvider();

    const result = await provider.refundPaymentIntent("mock_pi_1", 5000);

    expect(result.outcome).toBe("succeeded");
    expect(result.providerRefundId).toMatch(/^mock_re_/);
  });

  it("returns a distinct provider refund id on each call", async () => {
    const provider = new MockPaymentProvider();

    const first = await provider.refundPaymentIntent("mock_pi_1", 1000);
    const second = await provider.refundPaymentIntent("mock_pi_1", 2000);

    expect(first.providerRefundId).not.toBe(second.providerRefundId);
  });
});
