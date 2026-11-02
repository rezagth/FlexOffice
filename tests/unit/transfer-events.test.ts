import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * C5 — a transfer taken back by Stripe must leave PAID (and never be retried),
 * and a failed bank payout on the landlord's side must be journaled.
 */

const payoutFindUnique = vi.fn();
const payoutUpdateMany = vi.fn();
const organizationFindFirst = vi.fn();
const recordAudit = vi.fn();
const logError = vi.fn();
const logEvent = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    payout: { findUnique: payoutFindUnique, updateMany: payoutUpdateMany },
    organization: { findFirst: organizationFindFirst },
  },
}));
vi.mock("@/server/lib/audit", () => ({ recordAudit }));
vi.mock("@/server/lib/logger", () => ({ logError, logEvent }));

const { recordTransferReversed, recordBankPayoutFailed, isStripeTransferEventData, isStripeBankPayoutEventData } =
  await import("@/server/domains/payouts/transfer-events");

beforeEach(() => {
  for (const mock of [payoutFindUnique, payoutUpdateMany, organizationFindFirst, recordAudit, logError, logEvent]) {
    mock.mockReset();
  }
  recordAudit.mockResolvedValue(undefined);
});

describe("recordTransferReversed", () => {
  it("moves a PAID payout to REVERSED, journals it and raises the alert", async () => {
    payoutFindUnique.mockResolvedValue({ id: "po-1", organizationId: "org-1", amountCents: 8500, status: "PAID" });
    payoutUpdateMany.mockResolvedValue({ count: 1 });

    await recordTransferReversed({ id: "tr_1", amount_reversed: 8500 });

    expect(payoutFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { providerTransferId: "tr_1" } }));
    expect(payoutUpdateMany).toHaveBeenCalledWith({
      where: { id: "po-1", status: "PAID" },
      data: expect.objectContaining({ status: "REVERSED" }),
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ event: "payout.transfer_reversed", organizationId: "org-1" })
    );
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ event: "payout.transfer_reversed" }));
  });

  it("is idempotent: a replayed event changes and journals nothing", async () => {
    payoutFindUnique.mockResolvedValue({ id: "po-1", organizationId: "org-1", amountCents: 8500, status: "REVERSED" });
    payoutUpdateMany.mockResolvedValue({ count: 0 });

    await recordTransferReversed({ id: "tr_1" });

    expect(recordAudit).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it("ignores a transfer that is not one of ours", async () => {
    payoutFindUnique.mockResolvedValue(null);

    await recordTransferReversed({ id: "tr_unknown" });

    expect(payoutUpdateMany).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "payout.reversal_unknown_transfer" }));
  });
});

describe("recordBankPayoutFailed", () => {
  it("journals and alerts, tied to the landlord's organization", async () => {
    organizationFindFirst.mockResolvedValue({ id: "org-1" });

    await recordBankPayoutFailed({ id: "po_1", amount: 5000, failure_code: "account_closed" }, "acct_1");

    expect(organizationFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { stripeAccountId: "acct_1" } }));
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ event: "stripe_connect.bank_payout_failed", organizationId: "org-1" })
    );
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ event: "stripe_connect.bank_payout_failed" }));
  });

  it("still journals when the account is unknown", async () => {
    await recordBankPayoutFailed({ id: "po_1" }, undefined);
    expect(organizationFindFirst).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null }));
  });
});

describe("payload guards", () => {
  it("only accept Stripe-shaped ids", () => {
    expect(isStripeTransferEventData({ id: "tr_1" })).toBe(true);
    expect(isStripeTransferEventData({ id: "pi_1" })).toBe(false);
    expect(isStripeTransferEventData(null)).toBe(false);
    expect(isStripeBankPayoutEventData({ id: "po_1" })).toBe(true);
    expect(isStripeBankPayoutEventData({ id: "tr_1" })).toBe(false);
  });
});
