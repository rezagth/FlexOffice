import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.fn();
const findUnique = vi.fn();
const recordAudit = vi.fn();
const logError = vi.fn();
const logEvent = vi.fn();
const syncPaymentRefundStatus = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: { refund: { updateMany, findUnique } },
}));
vi.mock("@/server/lib/audit", () => ({ recordAudit }));
vi.mock("@/server/lib/logger", () => ({ logError, logEvent }));
vi.mock("@/server/domains/payments/refunds", () => ({ syncPaymentRefundStatus }));

const { applyRefundOutcome } = await import("@/server/domains/payments/apply-refund-outcome");

const refundRow = {
  id: "r1",
  paymentId: "p1",
  amountCents: 5000,
  payment: { organizationId: "org-1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  updateMany.mockResolvedValue({ count: 1 });
  findUnique.mockResolvedValue(refundRow);
});

describe("applyRefundOutcome — statuts Stripe", () => {
  it.each(["pending", "requires_action", "inconnu", ""])(
    "ignore le statut intermédiaire %j sans toucher au registre",
    async (status) => {
      await applyRefundOutcome("re_1", status);
      expect(updateMany).not.toHaveBeenCalled();
      expect(recordAudit).not.toHaveBeenCalled();
      expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "refund.outcome_unhandled_status" }));
    }
  );

  it("succeeded → SUCCEEDED, puis resynchronise le statut du paiement", async () => {
    await applyRefundOutcome("re_1", "succeeded");
    expect(updateMany).toHaveBeenCalledWith({
      where: { providerRefundId: "re_1", status: "PENDING" },
      data: { status: "SUCCEEDED" },
    });
    expect(syncPaymentRefundStatus).toHaveBeenCalledWith("p1");
    expect(logError).not.toHaveBeenCalled();
  });

  it.each(["failed", "canceled"])("%s → FAILED, alerte humaine, pas de resynchronisation", async (status) => {
    await applyRefundOutcome("re_1", status);
    expect(updateMany).toHaveBeenCalledWith({
      where: { providerRefundId: "re_1", status: "PENDING" },
      data: { status: "FAILED" },
    });
    expect(syncPaymentRefundStatus).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ event: "refund.failed_needs_attention", amount_cents: 5000, payment_id: "p1" })
    );
  });
});

describe("applyRefundOutcome — idempotence", () => {
  it("une livraison rejouée (aucune ligne PENDING) est sans effet", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await applyRefundOutcome("re_1", "succeeded");
    expect(findUnique).not.toHaveBeenCalled();
    expect(syncPaymentRefundStatus).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "refund.outcome_already_applied_or_unknown" })
    );
  });

  it("appliquer deux fois le même événement ne synchronise le paiement qu'une fois", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await applyRefundOutcome("re_1", "succeeded");
    await applyRefundOutcome("re_1", "succeeded");
    expect(syncPaymentRefundStatus).toHaveBeenCalledTimes(1);
  });
});

describe("applyRefundOutcome — course avec issueRefund", () => {
  it("rattache d'abord l'identifiant Stripe à la ligne via l'id placé dans les métadonnées", async () => {
    await applyRefundOutcome("re_1", "succeeded", "r1");
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "r1", providerRefundId: "pending:r1" },
      data: { providerRefundId: "re_1" },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: { status: "SUCCEEDED" } }));
  });

  it("sans id de ligne, ne tente aucun rattachement", async () => {
    await applyRefundOutcome("re_1", "succeeded", null);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("applyRefundOutcome — traçabilité", () => {
  it("écrit une trace d'audit rattachée à l'organisation du paiement", async () => {
    await applyRefundOutcome("re_1", "succeeded");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "refund.outcome_applied",
        organizationId: "org-1",
        metadata: expect.objectContaining({ providerRefundId: "re_1", status: "SUCCEEDED", paymentId: "p1" }),
      })
    );
  });

  it("n'échoue pas si la ligne a disparu entre-temps (organisation nulle)", async () => {
    findUnique.mockResolvedValue(null);
    await expect(applyRefundOutcome("re_1", "succeeded")).resolves.toBeUndefined();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null }));
  });
});
