import { beforeEach, describe, expect, it, vi } from "vitest";

const disputeFindUnique = vi.fn();
const paymentFindUnique = vi.fn();
const refundAggregate = vi.fn();
const txDisputeUpdateMany = vi.fn();
const txRefundCreate = vi.fn();
const txDisputeEventCreate = vi.fn();
const auditCreate = vi.fn();
const refundPaymentIntentMock = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    dispute: { findUnique: disputeFindUnique },
    payment: { findUnique: paymentFindUnique },
    refund: { aggregate: refundAggregate },
    auditLog: { create: auditCreate },
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        dispute: { updateMany: txDisputeUpdateMany },
        refund: { create: txRefundCreate },
        disputeEvent: { create: txDisputeEventCreate },
      }),
  },
}));

// Simulates a real (non-mock) provider without ever touching the network —
// resolveDispute() must go through this abstraction, never call the Stripe
// SDK directly.
vi.mock("@/server/domains/payments/get-payment-provider", () => ({
  getPaymentProvider: () => ({ refundPaymentIntent: refundPaymentIntentMock }),
}));

const { resolveDispute } = await import("@/server/domains/disputes/review");

const DISPUTE = { id: "dispute-1", bookingId: "book-1", status: "OPEN" };
const PAYMENT = {
  id: "pay-1",
  bookingId: "book-1",
  providerPaymentIntentId: "pi_stripe_123",
  amountCents: 9000,
  provider: "stripe",
  organizationId: "org-1",
};

beforeEach(() => {
  disputeFindUnique.mockReset().mockResolvedValue(DISPUTE);
  paymentFindUnique.mockReset().mockResolvedValue(PAYMENT);
  refundAggregate.mockReset().mockResolvedValue({ _sum: { amountCents: 0 } });
  txDisputeUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  txRefundCreate.mockReset().mockResolvedValue({});
  txDisputeEventCreate.mockReset().mockResolvedValue({});
  auditCreate.mockReset().mockResolvedValue({});
  refundPaymentIntentMock.mockReset();
});

describe("resolveDispute — REFUND outcome against a real (non-mock) payment", () => {
  it("issues the refund through the configured provider instead of refusing with a mock-only error", async () => {
    refundPaymentIntentMock.mockResolvedValue({
      providerRefundId: "re_stripe_1",
      outcome: "processing",
    });

    const result = await resolveDispute({
      disputeId: "dispute-1",
      actorUserId: "admin-1",
      outcome: "REFUND",
      notes: "Espace non conforme à l'annonce",
    });

    expect(result.status).toBe("RESOLVED_REFUND");
    expect(refundPaymentIntentMock).toHaveBeenCalledWith("pi_stripe_123", 9000);
  });

  it("stores the refund as PENDING, not SUCCEEDED, when the provider has not confirmed yet", async () => {
    refundPaymentIntentMock.mockResolvedValue({
      providerRefundId: "re_stripe_2",
      outcome: "processing",
    });

    await resolveDispute({
      disputeId: "dispute-1",
      actorUserId: "admin-1",
      outcome: "REFUND",
      notes: "Espace non conforme à l'annonce",
    });

    expect(txRefundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerRefundId: "re_stripe_2",
          status: "PENDING",
        }),
      })
    );
  });

  it("never calls the provider a second time once a concurrent resolution has already claimed the dispute", async () => {
    txDisputeUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      resolveDispute({
        disputeId: "dispute-1",
        actorUserId: "admin-1",
        outcome: "REFUND",
        notes: "Trop tard, déjà résolu ailleurs",
      })
    ).rejects.toThrow(/attente de décision/);

    expect(refundPaymentIntentMock).not.toHaveBeenCalled();
    expect(txRefundCreate).not.toHaveBeenCalled();
  });

  it("refuses a refund amount that exceeds what was actually paid, before ever calling the provider", async () => {
    await expect(
      resolveDispute({
        disputeId: "dispute-1",
        actorUserId: "admin-1",
        outcome: "REFUND",
        notes: "Montant excessif demandé",
        refundAmountCents: 20000,
      })
    ).rejects.toThrow(/dépasse le montant payé/);

    expect(refundPaymentIntentMock).not.toHaveBeenCalled();
    expect(txDisputeUpdateMany).not.toHaveBeenCalled();
    expect(txRefundCreate).not.toHaveBeenCalled();
  });
});
