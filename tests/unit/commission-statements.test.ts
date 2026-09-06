import { beforeEach, describe, expect, it, vi } from "vitest";

const organizationFindUniqueOrThrow = vi.fn();
const organizationUpdate = vi.fn();
const paymentFindMany = vi.fn();
const commissionStatementFindUnique = vi.fn();
const commissionStatementFindUniqueOrThrow = vi.fn();
const commissionStatementCreate = vi.fn();
const auditCreate = vi.fn();

const invoiceItemsCreate = vi.fn();
const invoicesCreate = vi.fn();
const invoicesFinalize = vi.fn();
const invoicesPay = vi.fn();
const customersCreate = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    organization: { findUniqueOrThrow: organizationFindUniqueOrThrow, update: organizationUpdate },
    payment: { findMany: paymentFindMany },
    commissionStatement: {
      findUnique: commissionStatementFindUnique,
      findUniqueOrThrow: commissionStatementFindUniqueOrThrow,
      create: commissionStatementCreate,
    },
    auditLog: { create: auditCreate },
  },
}));

vi.mock("stripe", () => ({
  // A constructor function that returns an object explicitly: `new` uses
  // that return value, so this doubles as a fake `Stripe` class without
  // vi.fn()'s "did not use function/class" warning from an arrow function.
  default: vi.fn().mockImplementation(function StripeMock() {
    return {
      customers: { create: customersCreate },
      invoiceItems: { create: invoiceItemsCreate },
      invoices: { create: invoicesCreate, finalizeInvoice: invoicesFinalize, pay: invoicesPay },
    };
  }),
}));

process.env.STRIPE_SECRET_KEY = "sk_test_x";

const { generateMonthlyCommissionStatement } = await import(
  "@/server/domains/payments/commission-statements"
);

const PERIOD_START = new Date("2026-08-01T00:00:00Z");
const PERIOD_END = new Date("2026-09-01T00:00:00Z");

const PAYMENT = {
  id: "pay-1",
  organizationId: "org-1",
  commissionAmountCents: 1500,
  capturedAt: new Date("2026-08-10T10:00:00Z"),
  booking: { space: { name: "Salle Rivoli" } },
};

beforeEach(() => {
  organizationFindUniqueOrThrow
    .mockReset()
    .mockResolvedValue({ id: "org-1", stripeCustomerId: "cus_existing", name: "Acme", email: "a@test.local" });
  organizationUpdate.mockReset().mockResolvedValue({});
  paymentFindMany.mockReset().mockResolvedValue([PAYMENT]);
  commissionStatementFindUnique.mockReset().mockResolvedValue(null);
  commissionStatementFindUniqueOrThrow.mockReset();
  commissionStatementCreate.mockReset().mockImplementation(({ data }) => ({ id: "stmt-1", ...data }));
  auditCreate.mockReset().mockResolvedValue({});

  customersCreate.mockReset().mockResolvedValue({ id: "cus_new" });
  invoiceItemsCreate.mockReset().mockResolvedValue({});
  invoicesCreate.mockReset().mockResolvedValue({ id: "in_1" });
  invoicesFinalize.mockReset().mockResolvedValue({ id: "in_1" });
  invoicesPay.mockReset().mockResolvedValue({
    id: "in_1",
    hosted_invoice_url: "https://invoice.stripe.com/i/in_1",
    invoice_pdf: "https://invoice.stripe.com/i/in_1.pdf",
  });
});

describe("generateMonthlyCommissionStatement", () => {
  it("returns null and makes no Stripe calls when there are no payments in the period", async () => {
    paymentFindMany.mockResolvedValue([]);
    const result = await generateMonthlyCommissionStatement("org-1", PERIOD_START, PERIOD_END);
    expect(result).toBeNull();
    expect(invoicesCreate).not.toHaveBeenCalled();
    expect(customersCreate).not.toHaveBeenCalled();
  });

  it("returns the existing statement instead of generating a second invoice for an already-billed month", async () => {
    const existing = { id: "stmt-existing", organizationId: "org-1", periodStart: PERIOD_START };
    commissionStatementFindUnique.mockResolvedValue(existing);

    const result = await generateMonthlyCommissionStatement("org-1", PERIOD_START, PERIOD_END);
    expect(result).toBe(existing);
    expect(invoicesCreate).not.toHaveBeenCalled();
  });

  it("creates one invoice item per booking payment, matching commissionAmountCents", async () => {
    await generateMonthlyCommissionStatement("org-1", PERIOD_START, PERIOD_END);

    expect(invoiceItemsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing", amount: 1500, currency: "eur" })
    );
  });

  it("finalizes and marks the invoice paid out-of-band, never attempting new collection", async () => {
    await generateMonthlyCommissionStatement("org-1", PERIOD_START, PERIOD_END);

    expect(invoicesFinalize).toHaveBeenCalledWith("in_1");
    expect(invoicesPay).toHaveBeenCalledWith("in_1", { paid_out_of_band: true });
  });

  it("includes the pending invoice items just created — confirmed live, invoices.create() otherwise finalizes empty", async () => {
    await generateMonthlyCommissionStatement("org-1", PERIOD_START, PERIOD_END);

    expect(invoicesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ pending_invoice_items_behavior: "include" })
    );
  });

  it("does not call pay() again when Stripe already marked the invoice paid on finalization", async () => {
    // Observed in Stripe test mode with days_until_due: 0 — finalizing can
    // already transition the invoice to paid, and a second pay() call on an
    // already-paid invoice is a real Stripe error, not a safe retry.
    invoicesFinalize.mockResolvedValueOnce({
      id: "in_1",
      status: "paid",
      hosted_invoice_url: "https://invoice.stripe.com/i/in_1",
      invoice_pdf: "https://invoice.stripe.com/i/in_1.pdf",
    });

    await generateMonthlyCommissionStatement("org-1", PERIOD_START, PERIOD_END);

    expect(invoicesPay).not.toHaveBeenCalled();
  });

  it("creates a Stripe Customer once and stores it on the org when none exists yet", async () => {
    organizationFindUniqueOrThrow.mockResolvedValue({
      id: "org-1",
      stripeCustomerId: null,
      name: "Acme",
      email: "a@test.local",
    });

    await generateMonthlyCommissionStatement("org-1", PERIOD_START, PERIOD_END);

    expect(customersCreate).toHaveBeenCalled();
    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { stripeCustomerId: "cus_new" },
    });
  });
});
