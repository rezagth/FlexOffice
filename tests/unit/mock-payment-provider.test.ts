import { describe, expect, it } from "vitest";
import { MockPaymentProvider } from "@/server/domains/payments/mock-provider";

const params = { providerPaymentIntentId: "mock_pi_1", amountCents: 5000, idempotencyKey: "r1" } as const;

describe("MockPaymentProvider.refundPayment", () => {
  it("succeeds synchronously — the mock is its own authority, no webhook to wait for", async () => {
    const result = await new MockPaymentProvider().refundPayment({ ...params, funding: "LANDLORD" });

    expect(result.outcome).toBe("succeeded");
    expect(result.providerRefundId).toMatch(/^mock_re_/);
  });

  it("mirrors Stripe's bookkeeping: the landlord bears the amount, the fee only for LANDLORD_AND_FEE", async () => {
    const provider = new MockPaymentProvider();
    const landlord = await provider.refundPayment({ ...params, funding: "LANDLORD" });
    const full = await provider.refundPayment({ ...params, funding: "LANDLORD_AND_FEE" });

    expect(landlord).toMatchObject({ reversedFromLandlord: true, applicationFeeRefunded: false });
    expect(full).toMatchObject({ reversedFromLandlord: true, applicationFeeRefunded: true });
  });

  it("returns a distinct provider refund id on each call", async () => {
    const provider = new MockPaymentProvider();
    const first = await provider.refundPayment({ ...params, funding: "LANDLORD" });
    const second = await provider.refundPayment({ ...params, funding: "LANDLORD" });

    expect(first.providerRefundId).not.toBe(second.providerRefundId);
  });
});

describe("MockPaymentProvider.createPaymentIntent", () => {
  it("authorizes synchronously (no card step)", async () => {
    const result = await new MockPaymentProvider().createPaymentIntent({
      bookingId: "b1",
      amountCents: 10000,
      applicationFeeCents: 1500,
    });
    expect(result.requiresClientConfirmation).toBe(false);
  });
});
