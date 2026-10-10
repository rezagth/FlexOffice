import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What we actually send to Stripe (audit 06/10/2026 B-01/B-02): the
 * commission as application fee, refunds taken back from the landlord, and
 * no charge for a landlord who cannot be paid. The SDK is replaced by a
 * recorder — no network.
 */

const piCreate = vi.fn();
const piCancel = vi.fn();
const piRetrieve = vi.fn();
const refundCreate = vi.fn();
const accountRetrieve = vi.fn();

vi.mock("stripe", () => ({
  default: class {
    paymentIntents = { create: piCreate, cancel: piCancel, retrieve: piRetrieve, capture: vi.fn() };
    refunds = { create: refundCreate };
    accounts = { retrieve: accountRetrieve };
    webhooks = { constructEvent: vi.fn() };
  },
}));

process.env.STRIPE_SECRET_KEY = "sk_test_x";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";

const { StripePaymentProvider } = await import("@/server/domains/payments/stripe-provider");

beforeEach(() => {
  for (const mock of [piCreate, piCancel, piRetrieve, refundCreate, accountRetrieve]) mock.mockReset();
  piCreate.mockResolvedValue({ id: "pi_1", client_secret: "cs_1" });
  refundCreate.mockResolvedValue({ id: "re_1" });
  piRetrieve.mockResolvedValue({ transfer_data: { destination: "acct_1" }, application_fee_amount: 1500 });
});

describe("createPaymentIntent", () => {
  it("collects the commission as application fee and transfers the rest to the landlord", async () => {
    const result = await new StripePaymentProvider().createPaymentIntent({
      bookingId: "b1",
      amountCents: 10000,
      applicationFeeCents: 1500,
      connectedAccountId: "acct_1",
    });

    expect(piCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10000,
        capture_method: "manual",
        application_fee_amount: 1500,
        transfer_data: { destination: "acct_1" },
      }),
      { idempotencyKey: "booking:b1:intent" }
    );
    expect(result).toEqual({ providerPaymentIntentId: "pi_1", clientSecret: "cs_1", requiresClientConfirmation: true });
  });

  it("refuses to charge without a connected account", async () => {
    await expect(
      new StripePaymentProvider().createPaymentIntent({ bookingId: "b1", amountCents: 10000, applicationFeeCents: 1500 })
    ).rejects.toMatchObject({ status: 409 });
    expect(piCreate).not.toHaveBeenCalled();
  });
});

describe("assertConnectedAccountCanBeCharged", () => {
  it("passes only when charges and payouts are enabled", async () => {
    const provider = new StripePaymentProvider();
    accountRetrieve.mockResolvedValue({ charges_enabled: true, payouts_enabled: true });
    await expect(provider.assertConnectedAccountCanBeCharged("acct_1")).resolves.toBeUndefined();

    accountRetrieve.mockResolvedValue({ charges_enabled: true, payouts_enabled: false });
    await expect(provider.assertConnectedAccountCanBeCharged("acct_1")).rejects.toMatchObject({ status: 409 });

    await expect(provider.assertConnectedAccountCanBeCharged(null)).rejects.toMatchObject({ status: 409 });
  });
});

describe("refundPayment", () => {
  it("LANDLORD: takes the refunded amount back from the landlord, keeps the commission", async () => {
    const result = await new StripePaymentProvider().refundPayment({
      providerPaymentIntentId: "pi_1",
      amountCents: 8500,
      funding: "LANDLORD",
      idempotencyKey: "row-1",
    });

    const [args, options] = refundCreate.mock.calls[0];
    expect(args).toMatchObject({ payment_intent: "pi_1", amount: 8500, reverse_transfer: true });
    expect(args).not.toHaveProperty("refund_application_fee");
    expect(args.metadata).toMatchObject({ refund_row_id: "row-1" });
    expect(options).toEqual({ idempotencyKey: "refund:row-1" });
    expect(result).toMatchObject({ outcome: "processing", reversedFromLandlord: true, applicationFeeRefunded: false });
  });

  it("LANDLORD_AND_FEE: also refunds the platform's commission", async () => {
    const result = await new StripePaymentProvider().refundPayment({
      providerPaymentIntentId: "pi_1",
      amountCents: 10000,
      funding: "LANDLORD_AND_FEE",
      idempotencyKey: "row-2",
    });
    expect(refundCreate.mock.calls[0][0]).toMatchObject({ reverse_transfer: true, refund_application_fee: true });
    expect(result.applicationFeeRefunded).toBe(true);
  });

  it("a legacy payment without transfer is refunded by the platform, and says so", async () => {
    piRetrieve.mockResolvedValue({ transfer_data: null, application_fee_amount: null });
    const result = await new StripePaymentProvider().refundPayment({
      providerPaymentIntentId: "pi_old",
      amountCents: 5000,
      funding: "LANDLORD",
      idempotencyKey: "row-3",
    });
    expect(refundCreate.mock.calls[0][0]).not.toHaveProperty("reverse_transfer");
    expect(result.reversedFromLandlord).toBe(false);
  });
});

describe("cancelPaymentIntent", () => {
  it("forwards our reason, and none for a landlord refusal", async () => {
    const provider = new StripePaymentProvider();
    await provider.cancelPaymentIntent("pi_1", "abandoned");
    await provider.cancelPaymentIntent("pi_2", "declined");
    expect(piCancel).toHaveBeenNthCalledWith(1, "pi_1", { cancellation_reason: "abandoned" });
    expect(piCancel).toHaveBeenNthCalledWith(2, "pi_2", {});
  });
});
