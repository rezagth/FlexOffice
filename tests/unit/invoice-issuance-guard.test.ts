import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * C2 — an invoice number is sequential and irrevocable: with live Stripe keys
 * and an incomplete platform identity, nothing is numbered, and the sweep
 * reports it once instead of once per payment.
 */

const invoiceFindUnique = vi.fn();
const paymentFindUnique = vi.fn();
const paymentFindMany = vi.fn();
const refundFindUnique = vi.fn();
const refundFindMany = vi.fn();
const transaction = vi.fn();
const logError = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    invoice: { findUnique: invoiceFindUnique },
    payment: { findUnique: paymentFindUnique, findMany: paymentFindMany },
    refund: { findUnique: refundFindUnique, findMany: refundFindMany },
    $transaction: transaction,
  },
}));
vi.mock("@/server/lib/logger", () => ({ logError, logEvent: vi.fn() }));

const { issueBookingInvoice, issueCreditNote, issueMissingInvoiceDocuments } = await import(
  "@/server/domains/invoicing/issue"
);

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

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const key of PLATFORM_KEYS) vi.stubEnv(key, "");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("OFFICEFLEX_DEMO_MODE", "");
  vi.stubEnv("PAYMENT_PROVIDER", "stripe");
  for (const mock of [invoiceFindUnique, paymentFindUnique, paymentFindMany, refundFindUnique, refundFindMany, transaction, logError]) {
    mock.mockReset();
  }
  invoiceFindUnique.mockResolvedValue(null);
  paymentFindUnique.mockResolvedValue(null);
  paymentFindMany.mockResolvedValue([]);
  refundFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("with live keys and an incomplete platform identity", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x");
  });

  it("issues no booking invoice and takes no number", async () => {
    expect(await issueBookingInvoice("payment-1")).toBeNull();
    expect(paymentFindUnique).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ event: "invoicing.blocked_platform_identity_incomplete" })
    );
  });

  it("issues no credit note", async () => {
    expect(await issueCreditNote("refund-1")).toBeNull();
    expect(refundFindUnique).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("reports once per sweep and does not even read the payments", async () => {
    expect(await issueMissingInvoiceDocuments()).toEqual({ payments: 0, failed: 0 });
    expect(paymentFindMany).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("still returns an invoice that already exists", async () => {
    const existing = { id: "inv-1", number: "F-X-2026-1" };
    invoiceFindUnique.mockResolvedValue(existing);
    expect(await issueBookingInvoice("payment-1")).toBe(existing);
  });
});

describe("in Stripe test mode", () => {
  it("does not block: the payment is looked up as usual", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    expect(await issueBookingInvoice("payment-1")).toBeNull(); // payment not found in the stub
    expect(paymentFindUnique).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });
});
