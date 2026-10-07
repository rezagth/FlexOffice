import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stripe mirror of a commission statement (FCT-17). The local FC invoice is
 * the document; Stripe only mirrors it — resumably, never twice, and never
 * collecting money again (the commission was taken at capture time).
 * Statement generation itself is covered against a real database in
 * tests/integration/invoicing.test.ts.
 */

const statementFindUnique = vi.fn();
const statementUpdate = vi.fn();
const orgFindUniqueOrThrow = vi.fn();
const orgUpdate = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    commissionStatement: { findUnique: statementFindUnique, update: statementUpdate },
    organization: { findUniqueOrThrow: orgFindUniqueOrThrow, update: orgUpdate },
  },
}));

const stripe = vi.hoisted(() => ({
  customers: { create: vi.fn() },
  taxRates: { list: vi.fn(), create: vi.fn() },
  invoiceItems: { list: vi.fn(), create: vi.fn() },
  invoices: { create: vi.fn(), retrieve: vi.fn(), finalizeInvoice: vi.fn(), pay: vi.fn() },
}));
vi.mock("stripe", () => ({
  default: class {
    customers = stripe.customers;
    taxRates = stripe.taxRates;
    invoiceItems = stripe.invoiceItems;
    invoices = stripe.invoices;
  },
}));

process.env.STRIPE_SECRET_KEY = "sk_test_x";

const { syncCommissionStatementToStripe, resetCommissionTaxRateCacheForTests } = await import(
  "@/server/domains/payments/commission-statements"
);

const STATEMENT = {
  id: "cs-1",
  organizationId: "org-1",
  stripeInvoiceId: null as string | null,
  stripeSyncedAt: null,
  invoice: {
    number: "FC-2026-000001",
    vatRateBasisPoints: 2000,
    lines: [
      { description: "Commission d'intermédiation — Salle Rivoli", detail: "x", reference: "OFX-2026-000001", totalCents: 1500 },
      { description: "Commission d'intermédiation — Bureau", detail: "y", reference: null, totalCents: 900 },
    ],
  },
};

beforeEach(() => {
  resetCommissionTaxRateCacheForTests();
  for (const group of Object.values(stripe)) for (const fn of Object.values(group)) fn.mockReset();
  statementFindUnique.mockReset().mockResolvedValue({ ...STATEMENT });
  statementUpdate.mockReset().mockImplementation(async ({ data }) => ({ ...STATEMENT, ...data }));
  orgFindUniqueOrThrow.mockReset().mockResolvedValue({ id: "org-1", stripeCustomerId: "cus_1", name: "Org", legalName: null, email: "o@x.fr" });
  orgUpdate.mockReset();
  stripe.taxRates.list.mockResolvedValue({ data: [] });
  stripe.taxRates.create.mockResolvedValue({ id: "txr_1" });
  stripe.invoiceItems.list.mockResolvedValue({ data: [] });
  stripe.invoiceItems.create.mockResolvedValue({});
  stripe.invoices.create.mockResolvedValue({ id: "in_1" });
  stripe.invoices.retrieve.mockResolvedValue({ id: "in_1", status: "draft" });
  stripe.invoices.finalizeInvoice.mockResolvedValue({ id: "in_1", status: "open" });
  stripe.invoices.pay.mockResolvedValue({ id: "in_1", status: "paid", hosted_invoice_url: "https://h", invoice_pdf: "https://p" });
});

describe("syncCommissionStatementToStripe", () => {
  it("creates one invoice item per line, VAT-inclusive, then an invoice that includes them", async () => {
    await syncCommissionStatementToStripe("cs-1");

    expect(stripe.invoiceItems.create).toHaveBeenCalledTimes(2);
    expect(stripe.invoiceItems.create.mock.calls[0][0]).toMatchObject({ amount: 1500, tax_rates: ["txr_1"], customer: "cus_1" });
    expect(stripe.taxRates.create.mock.calls[0][0]).toMatchObject({ percentage: 20, inclusive: true });
    expect(stripe.invoices.create.mock.calls[0][0]).toMatchObject({ pending_invoice_items_behavior: "include", auto_advance: false });
  });

  it("finalizes and marks the invoice paid out of band — never collects again", async () => {
    const updated = await syncCommissionStatementToStripe("cs-1");
    expect(stripe.invoices.finalizeInvoice).toHaveBeenCalledWith("in_1");
    expect(stripe.invoices.pay).toHaveBeenCalledWith("in_1", { paid_out_of_band: true });
    expect(updated).toMatchObject({ invoicePdfUrl: "https://p", stripeSyncError: null });
  });

  it("does not call pay() when Stripe already marked the invoice paid", async () => {
    stripe.invoices.finalizeInvoice.mockResolvedValue({ id: "in_1", status: "paid" });
    await syncCommissionStatementToStripe("cs-1");
    expect(stripe.invoices.pay).not.toHaveBeenCalled();
  });

  it("resumes: never re-creates items or the invoice already made", async () => {
    stripe.invoiceItems.list.mockResolvedValue({ data: [{ metadata: { commissionStatementId: "cs-1", line: "0" } }] });
    await syncCommissionStatementToStripe("cs-1");
    expect(stripe.invoiceItems.create).toHaveBeenCalledTimes(1); // only line 1

    stripe.invoiceItems.create.mockClear();
    stripe.invoices.create.mockClear();
    statementFindUnique.mockResolvedValue({ ...STATEMENT, stripeInvoiceId: "in_1" });
    await syncCommissionStatementToStripe("cs-1");
    expect(stripe.invoiceItems.create).not.toHaveBeenCalled();
    expect(stripe.invoices.create).not.toHaveBeenCalled();
  });

  it("creates the Stripe customer once and stores it", async () => {
    orgFindUniqueOrThrow.mockResolvedValue({ id: "org-1", stripeCustomerId: null, name: "Org", legalName: "Org SAS", email: "o@x.fr" });
    stripe.customers.create.mockResolvedValue({ id: "cus_new" });
    await syncCommissionStatementToStripe("cs-1");
    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Org SAS" }),
      { idempotencyKey: "org-customer-org-1" }
    );
    expect(orgUpdate).toHaveBeenCalledWith({ where: { id: "org-1" }, data: { stripeCustomerId: "cus_new" } });
  });

  it("records the error on the statement instead of throwing", async () => {
    stripe.invoices.create.mockRejectedValue(new Error("Stripe down"));
    expect(await syncCommissionStatementToStripe("cs-1")).toBeNull();
    expect(statementUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { stripeSyncError: "Stripe down" } })
    );
  });

  it("does nothing for an already-synced statement", async () => {
    statementFindUnique.mockResolvedValue({ ...STATEMENT, stripeSyncedAt: new Date() });
    await syncCommissionStatementToStripe("cs-1");
    expect(stripe.invoiceItems.create).not.toHaveBeenCalled();
  });
});
