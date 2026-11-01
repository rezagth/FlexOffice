import { beforeEach, describe, expect, it, vi } from "vitest";

const paymentFindUnique = vi.fn();
const paymentUpdateMany = vi.fn();
const refundAggregate = vi.fn();
const issueInvoiceDocumentsSafely = vi.fn();
const transaction = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    payment: { findUnique: paymentFindUnique, updateMany: paymentUpdateMany },
    refund: { aggregate: refundAggregate },
    $transaction: transaction,
  },
}));
vi.mock("@/server/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/server/lib/logger", () => ({ logError: vi.fn(), logEvent: vi.fn() }));
vi.mock("@/server/domains/payments/get-payment-provider", () => ({ getPaymentProvider: vi.fn() }));
vi.mock("@/server/domains/invoicing/issue", () => ({ issueInvoiceDocumentsSafely }));

const { disputeRefundFunding, syncPaymentRefundStatus, issueRefund } = await import("@/server/domains/payments/refunds");
const { ValidationError } = await import("@/server/lib/errors");

const payment = { amountCents: 10000, netAmountCents: 8500 };

beforeEach(() => vi.clearAllMocks());

describe("disputeRefundFunding", () => {
  it("remboursement total → le bailleur ET la commission (LANDLORD_AND_FEE)", () => {
    expect(disputeRefundFunding(10000, payment)).toBe("LANDLORD_AND_FEE");
  });

  it("remboursement partiel dans la part du bailleur → LANDLORD", () => {
    expect(disputeRefundFunding(5000, payment)).toBe("LANDLORD");
    expect(disputeRefundFunding(8500, payment)).toBe("LANDLORD");
    expect(disputeRefundFunding(1, payment)).toBe("LANDLORD");
  });

  it("entre la part du bailleur et le total → refusé", () => {
    expect(() => disputeRefundFunding(8501, payment)).toThrow(ValidationError);
    expect(() => disputeRefundFunding(9999, payment)).toThrow(/85,00/);
  });

  it("plus que le paiement → refusé aussi (jamais LANDLORD_AND_FEE)", () => {
    expect(() => disputeRefundFunding(10001, payment)).toThrow(ValidationError);
  });

  it("sans commission, le total est quand même un remboursement total", () => {
    expect(disputeRefundFunding(10000, { amountCents: 10000, netAmountCents: 10000 })).toBe("LANDLORD_AND_FEE");
  });
});

describe("syncPaymentRefundStatus", () => {
  it("paiement inconnu → rien", async () => {
    paymentFindUnique.mockResolvedValue(null);
    await syncPaymentRefundStatus("p1");
    expect(paymentUpdateMany).not.toHaveBeenCalled();
  });

  it("aucun remboursement abouti → statut inchangé, pas d'avoir", async () => {
    paymentFindUnique.mockResolvedValue({ amountCents: 10000 });
    refundAggregate.mockResolvedValue({ _sum: { amountCents: null } });
    await syncPaymentRefundStatus("p1");
    expect(paymentUpdateMany).not.toHaveBeenCalled();
    expect(issueInvoiceDocumentsSafely).not.toHaveBeenCalled();
  });

  it("remboursement partiel → PARTIALLY_REFUNDED et avoir émis", async () => {
    paymentFindUnique.mockResolvedValue({ amountCents: 10000 });
    refundAggregate.mockResolvedValue({ _sum: { amountCents: 4000 } });
    await syncPaymentRefundStatus("p1");
    expect(paymentUpdateMany.mock.calls[0][0].data).toEqual({ status: "PARTIALLY_REFUNDED" });
    expect(issueInvoiceDocumentsSafely).toHaveBeenCalledWith("p1");
  });

  it("remboursement total → REFUNDED", async () => {
    paymentFindUnique.mockResolvedValue({ amountCents: 10000 });
    refundAggregate.mockResolvedValue({ _sum: { amountCents: 10000 } });
    await syncPaymentRefundStatus("p1");
    expect(paymentUpdateMany.mock.calls[0][0].data).toEqual({ status: "REFUNDED" });
  });

  it("ne rétrograde que des paiements encaissés (jamais un FAILED ou REFUNDED déjà final)", async () => {
    paymentFindUnique.mockResolvedValue({ amountCents: 10000 });
    refundAggregate.mockResolvedValue({ _sum: { amountCents: 1000 } });
    await syncPaymentRefundStatus("p1");
    expect(paymentUpdateMany.mock.calls[0][0].where.status).toEqual({ in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] });
  });

  it("ne compte que les remboursements SUCCEEDED", async () => {
    paymentFindUnique.mockResolvedValue({ amountCents: 10000 });
    refundAggregate.mockResolvedValue({ _sum: { amountCents: 1000 } });
    await syncPaymentRefundStatus("p1");
    expect(refundAggregate.mock.calls[0][0].where.status).toBe("SUCCEEDED");
  });
});

describe("issueRefund — validation avant tout mouvement d'argent", () => {
  it.each([0, -1, -5000, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("refuse le montant %s", async (amountCents) => {
    await expect(
      issueRefund({ paymentId: "p1", amountCents, funding: "LANDLORD", reason: "test" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transaction).not.toHaveBeenCalled();
  });
});
