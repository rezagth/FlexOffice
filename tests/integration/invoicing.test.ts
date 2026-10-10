import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * Lot F — legal invoicing against a real PostgreSQL: sequential numbering
 * without gaps (also under concurrency), credit notes in the same series,
 * HT/TVA/TTC to the cent, immutability, access scoping, and the monthly
 * commission statements (idempotent, FC series).
 */
describe.skipIf(!hasDatabase)("invoicing", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let fixtures: typeof import("./helpers/test-fixtures");
  let issue: typeof import("@/server/domains/invoicing/issue");
  let queries: typeof import("@/server/domains/invoicing/queries");
  let monthly: typeof import("@/server/domains/invoicing/monthly-statements");
  let applyPaymentOutcome: typeof import("@/server/domains/payments/apply-outcome").applyPaymentOutcome;
  let parisMonthPeriod: typeof import("@/server/domains/invoicing/paris-time").parisMonthPeriod;

  const orgIds: string[] = [];
  const userIds: string[] = [];
  const propertyIds: string[] = [];
  let vatOrgId: string; // landlord with a VAT number
  let exemptOrgId: string; // landlord without one (art. 293 B)
  let clientId: string;
  let otherClientId: string;
  let landlordUserId: string;
  const spaceByOrg = new Map<string, string>();
  let hourOffset = 0;

  // 2021-03 is used by no other suite: the monthly run can process "every
  // organization of the month" without touching anyone else's data.
  const MONTH = "2021-03";
  const IN_MONTH = new Date("2021-03-15T10:00:00Z");

  async function newOrg(vatNumber: string | null) {
    const org = await fixtures.createTestOrganization({ name: "Invoicing Org" });
    await prisma.organization.update({
      where: { id: org.id },
      data: { legalName: "Bureaux Test SAS", vatNumber, status: "VERIFIED" },
    });
    const property = await fixtures.createTestProperty(org.id, landlordUserId);
    const space = await fixtures.createTestSpace(org.id, property.id);
    orgIds.push(org.id);
    propertyIds.push(property.id);
    spaceByOrg.set(org.id, space.id);
    return org.id;
  }

  /** A booking with a captured payment, inserted directly (no issuance). */
  async function capturedPayment(
    organizationId: string,
    opts: { amountCents?: number; commissionCents?: number; capturedAt?: Date; clientUserId?: string; status?: "SUCCEEDED" | "REQUIRES_CAPTURE" } = {}
  ) {
    hourOffset += 3;
    const startsAt = new Date(Date.UTC(2020, 0, 1) + hourOffset * 3_600_000);
    const amountCents = opts.amountCents ?? 10000;
    const commissionCents = opts.commissionCents ?? 1500;
    const booking = await prisma.booking.create({
      data: {
        spaceId: spaceByOrg.get(organizationId)!,
        organizationId,
        clientUserId: opts.clientUserId ?? clientId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        status: opts.status === "REQUIRES_CAPTURE" ? "PENDING" : "COMPLETED",
        participantsCount: 2,
        purpose: "Test",
        priceAmountCents: amountCents,
        commissionAmountCents: commissionCents,
      },
    });
    return prisma.payment.create({
      data: {
        bookingId: booking.id,
        organizationId,
        providerPaymentIntentId: `pi_inv_${booking.id}`,
        amountCents,
        commissionAmountCents: commissionCents,
        netAmountCents: amountCents - commissionCents,
        status: opts.status ?? "SUCCEEDED",
        capturedAt: opts.status === "REQUIRES_CAPTURE" ? null : (opts.capturedAt ?? new Date()),
      },
    });
  }

  async function settledRefund(paymentId: string, amountCents: number, opts: { fee?: boolean; reversal?: number } = {}) {
    return prisma.refund.create({
      data: {
        paymentId,
        amountCents,
        reason: "Annulation par le client",
        providerRefundId: `re_inv_${paymentId}_${amountCents}_${Math.random()}`,
        status: "SUCCEEDED",
        landlordReversalCents: opts.reversal ?? amountCents,
        applicationFeeRefunded: opts.fee ?? false,
      },
    });
  }

  const counter = async (organizationId: string) =>
    (
      await prisma.invoiceNumberCounter.findMany({ where: { seriesKey: `org:${organizationId}` } })
    ).reduce((sum, row) => sum + row.lastValue, 0);

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    fixtures = await import("./helpers/test-fixtures");
    issue = await import("@/server/domains/invoicing/issue");
    queries = await import("@/server/domains/invoicing/queries");
    monthly = await import("@/server/domains/invoicing/monthly-statements");
    ({ applyPaymentOutcome } = await import("@/server/domains/payments/apply-outcome"));
    ({ parisMonthPeriod } = await import("@/server/domains/invoicing/paris-time"));

    const [client, other, landlord] = await Promise.all([
      fixtures.createTestUser({ role: "CLIENT", name: "Invoice Client" }),
      fixtures.createTestUser({ role: "CLIENT", name: "Other Client" }),
      fixtures.createTestUser({ role: "CLIENT", name: "Invoice Landlord" }),
    ]);
    clientId = client.id;
    otherClientId = other.id;
    landlordUserId = landlord.id;
    userIds.push(client.id, other.id, landlord.id);

    vatOrgId = await newOrg("FR12345678901");
    exemptOrgId = await newOrg(null);
  });

  afterAll(async () => {
    if (orgIds.length > 0) {
      const orgs = { in: orgIds };
      await prisma.commissionStatement.deleteMany({ where: { organizationId: orgs } });
      const payments = await prisma.payment.findMany({ where: { organizationId: orgs }, select: { id: true } });
      await prisma.refund.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
      await prisma.payment.deleteMany({ where: { organizationId: orgs } });
      await prisma.booking.deleteMany({ where: { organizationId: orgs } });
      await prisma.auditLog.deleteMany({ where: { organizationId: orgs } });
      await prisma.invoiceNumberCounter.deleteMany({ where: { seriesKey: { in: orgIds.map((id) => `org:${id}`) } } });
      await prisma.space.deleteMany({ where: { organizationId: orgs } });
      await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });
      await prisma.organization.deleteMany({ where: { id: orgs } });
    }
    for (const id of userIds) await fixtures.deleteTestUser(id);
    await prisma.$disconnect();
  });

  describe("numbering", () => {
    it("numbers a landlord's invoices 1, 2, 3… in its own series, in issue order", async () => {
      const orgId = await newOrg("FR00000000001");
      const issued = [];
      for (let i = 0; i < 3; i++) {
        const payment = await capturedPayment(orgId);
        issued.push(await issue.issueBookingInvoice(payment.id));
      }
      const year = new Date().getFullYear();
      const code = orgId.replace(/-/g, "").slice(0, 6).toUpperCase();
      expect(issued.map((i) => i!.sequence)).toEqual([1, 2, 3]);
      expect(issued.map((i) => i!.number)).toEqual([1, 2, 3].map((n) => `F-${code}-${year}-0000${n}`));
      expect(issued[0]!.issuedAt.getTime()).toBeLessThanOrEqual(issued[1]!.issuedAt.getTime());
      expect(issued[1]!.issuedAt.getTime()).toBeLessThanOrEqual(issued[2]!.issuedAt.getTime());
      // Another landlord's series is independent.
      const other = await issue.issueBookingInvoice((await capturedPayment(exemptOrgId)).id);
      expect(other!.seriesKey).toBe(`org:${exemptOrgId}`);
    });

    it("stays continuous under concurrent issuance — no duplicate, no gap", async () => {
      const orgId = await newOrg("FR00000000002");
      const payments = await Promise.all(Array.from({ length: 15 }, () => capturedPayment(orgId)));
      const invoices = await Promise.all(payments.map((p) => issue.issueBookingInvoice(p.id)));
      const sequences = invoices.map((i) => i!.sequence).sort((a, b) => a - b);
      expect(sequences).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
      expect(await counter(orgId)).toBe(15);
    });

    it("issues one invoice when the same payment is issued concurrently, and the losers' numbers are not lost", async () => {
      const orgId = await newOrg("FR00000000003");
      const payment = await capturedPayment(orgId);
      const results = await Promise.all(Array.from({ length: 6 }, () => issue.issueBookingInvoice(payment.id)));
      expect(new Set(results.map((r) => r!.id)).size).toBe(1);
      expect(await prisma.invoice.count({ where: { paymentId: payment.id } })).toBe(1);
      // Rolled-back increments: the counter equals the number of documents.
      expect(await counter(orgId)).toBe(1);
      const next = await issue.issueBookingInvoice((await capturedPayment(orgId)).id);
      expect(next!.sequence).toBe(2);
    });

    it("issues nothing for a payment that was not captured", async () => {
      const payment = await capturedPayment(vatOrgId, { status: "REQUIRES_CAPTURE" });
      expect(await issue.issueBookingInvoice(payment.id)).toBeNull();
    });
  });

  describe("amounts", () => {
    it("extracts 20 % VAT from a TTC price when the landlord has a VAT number, to the cent", async () => {
      const invoice = await issue.issueBookingInvoice((await capturedPayment(vatOrgId, { amountCents: 10000, commissionCents: 1500 })).id);
      expect(invoice).toMatchObject({ totalCents: 10000, netCents: 8333, vatCents: 1667, vatRateBasisPoints: 2000, vatExempt: false, serviceFeeCents: 1500 });
      const odd = await issue.issueBookingInvoice((await capturedPayment(vatOrgId, { amountCents: 9999, commissionCents: 1500 })).id);
      expect(odd).toMatchObject({ totalCents: 9999, netCents: 8333, vatCents: 1666 });
    });

    it("applies no VAT (art. 293 B) when the landlord has no VAT number", async () => {
      const invoice = await issue.issueBookingInvoice((await capturedPayment(exemptOrgId, { amountCents: 12000 })).id);
      expect(invoice).toMatchObject({ totalCents: 12000, netCents: 12000, vatCents: 0, vatRateBasisPoints: 0, vatExempt: true });
    });

    it("snapshots the landlord and the client at issuance", async () => {
      const invoice = await issue.issueBookingInvoice((await capturedPayment(vatOrgId)).id);
      expect(invoice!.seller).toMatchObject({ legalName: "Bureaux Test SAS", vatNumber: "FR12345678901" });
      expect(invoice!.buyer).toMatchObject({ name: "Invoice Client" });
      await prisma.organization.update({ where: { id: vatOrgId }, data: { legalName: "Renamed SAS" } });
      const reread = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice!.id } });
      expect(reread.seller).toMatchObject({ legalName: "Bureaux Test SAS" });
      await prisma.organization.update({ where: { id: vatOrgId }, data: { legalName: "Bureaux Test SAS" } });
    });
  });

  describe("credit notes", () => {
    it("issues a credit note for a settled refund, in the same series, linked to the invoice", async () => {
      const orgId = await newOrg("FR00000000004");
      const payment = await capturedPayment(orgId, { amountCents: 10000, commissionCents: 1500 });
      await settledRefund(payment.id, 8500);
      const { invoice, creditNotes } = await issue.ensureInvoiceDocumentsForPayment(payment.id);
      expect(creditNotes).toHaveLength(1);
      const note = creditNotes[0];
      expect(note).toMatchObject({
        kind: "CREDIT_NOTE",
        seriesKey: invoice!.seriesKey,
        sequence: invoice!.sequence + 1,
        creditedInvoiceId: invoice!.id,
        totalCents: 8500,
        netCents: 7083,
        vatCents: 1417,
        serviceFeeCents: 0,
      });
      // Idempotent.
      const again = await issue.ensureInvoiceDocumentsForPayment(payment.id);
      expect(again.creditNotes).toHaveLength(0);
      expect(await prisma.invoice.count({ where: { creditedInvoiceId: invoice!.id } })).toBe(1);
    });

    it("records the service fee refunded with a full refund", async () => {
      const payment = await capturedPayment(vatOrgId, { amountCents: 10000, commissionCents: 1500 });
      await settledRefund(payment.id, 10000, { fee: true, reversal: 8500 });
      const { creditNotes } = await issue.ensureInvoiceDocumentsForPayment(payment.id);
      expect(creditNotes[0]).toMatchObject({ totalCents: 10000, serviceFeeCents: 1500 });
    });

    it("keeps the VAT regime of the credited invoice", async () => {
      const payment = await capturedPayment(exemptOrgId, { amountCents: 5000 });
      await settledRefund(payment.id, 2500);
      const { creditNotes } = await issue.ensureInvoiceDocumentsForPayment(payment.id);
      expect(creditNotes[0]).toMatchObject({ vatExempt: true, vatCents: 0, netCents: 2500 });
    });
  });

  describe("issuance paths", () => {
    it("issues the invoice when the payment is captured", async () => {
      const payment = await capturedPayment(vatOrgId, { status: "REQUIRES_CAPTURE" });
      await applyPaymentOutcome(payment.providerPaymentIntentId, "captured");
      const invoice = await prisma.invoice.findUnique({ where: { paymentId: payment.id } });
      expect(invoice?.kind).toBe("INVOICE");
    });

    it("catches up captured payments that have no invoice yet", async () => {
      const payment = await capturedPayment(exemptOrgId);
      await settledRefund(payment.id, 1000);
      await issue.issueMissingInvoiceDocuments();
      expect(await prisma.invoice.count({ where: { paymentId: payment.id } })).toBe(1);
      expect(await prisma.invoice.count({ where: { refund: { paymentId: payment.id } } })).toBe(1);
    });
  });

  describe("immutability", () => {
    it("refuses any update or direct delete of an issued document", async () => {
      const invoice = await issue.issueBookingInvoice((await capturedPayment(vatOrgId)).id);
      await expect(
        prisma.$executeRawUnsafe(`UPDATE invoices SET total_cents = 1, net_cents = 1, vat_cents = 0 WHERE id = $1::uuid`, invoice!.id)
      ).rejects.toThrow(/immutable/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM invoices WHERE id = $1::uuid`, invoice!.id)).rejects.toThrow(/immutable/);
    });

    it("refuses an inconsistent total at the database level", async () => {
      const payment = await capturedPayment(vatOrgId);
      await expect(
        prisma.invoice.create({
          data: {
            kind: "INVOICE",
            seriesKey: "test",
            year: 2026,
            sequence: 1,
            number: "X",
            issuedAt: new Date(),
            organizationId: vatOrgId,
            paymentId: payment.id,
            seller: { name: "x" },
            buyer: { name: "y" },
            lines: [],
            totalCents: 100,
            netCents: 80,
            vatCents: 10,
            vatRateBasisPoints: 2000,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("access scoping", () => {
    it("lets the client read their own documents only", async () => {
      const payment = await capturedPayment(vatOrgId);
      await settledRefund(payment.id, 500);
      const { invoice, creditNotes } = await issue.ensureInvoiceDocumentsForPayment(payment.id);
      expect(await queries.findClientInvoice(invoice!.id, clientId)).not.toBeNull();
      expect(await queries.findClientInvoice(creditNotes[0].id, clientId)).not.toBeNull();
      expect(await queries.findClientInvoice(invoice!.id, otherClientId)).toBeNull();
      expect(await queries.findClientInvoice(creditNotes[0].id, otherClientId)).toBeNull();
    });

    it("lets an organization read its own documents only", async () => {
      const invoice = await issue.issueBookingInvoice((await capturedPayment(vatOrgId)).id);
      expect(await queries.findOrganizationInvoice(invoice!.id, vatOrgId)).not.toBeNull();
      expect(await queries.findOrganizationInvoice(invoice!.id, exemptOrgId)).toBeNull();
    });
  });

  describe("monthly commission statements (FCT-17)", () => {
    let statementOrgId: string;

    beforeAll(async () => {
      statementOrgId = await newOrg("FR00000000005");
      await capturedPayment(statementOrgId, { amountCents: 10000, commissionCents: 1500, capturedAt: IN_MONTH });
      await capturedPayment(statementOrgId, { amountCents: 20000, commissionCents: 3000, capturedAt: IN_MONTH });
      // Landlord cancellation: everything refunded, commission included —
      // nothing kept, nothing to bill on that one.
      const refunded = await capturedPayment(statementOrgId, { amountCents: 10000, commissionCents: 1500, capturedAt: IN_MONTH });
      await settledRefund(refunded.id, 10000, { fee: true, reversal: 8500 });
      // Outside the month.
      await capturedPayment(statementOrgId, { capturedAt: new Date("2021-04-01T09:00:00Z") });
    });

    it("bills the commission kept over the Paris month, VAT included, as an FC invoice", async () => {
      const results = await monthly.generateCommissionStatementsForMonth(MONTH);
      const mine = results.find((r) => r.organizationId === statementOrgId);
      expect(mine?.outcome).toBe("generated");

      const { periodStart } = parisMonthPeriod(MONTH);
      const statement = await prisma.commissionStatement.findUniqueOrThrow({
        where: { organizationId_periodStart: { organizationId: statementOrgId, periodStart } },
        include: { invoice: true },
      });
      expect(statement.totalCommissionAmountCents).toBe(4500);
      expect(statement.stripeInvoiceId).toBeNull();
      expect(statement.invoice).toMatchObject({
        kind: "COMMISSION_INVOICE",
        seriesKey: "FC",
        totalCents: 4500,
        netCents: 3750,
        vatCents: 750,
        vatRateBasisPoints: 2000,
      });
      expect(statement.invoice!.number).toMatch(/^FC-\d{4}-\d{5}$/);
      expect(statement.invoice!.lines).toHaveLength(2);
    });

    it("is idempotent: a second run, or concurrent runs, never bill a month twice", async () => {
      const fcBefore = await prisma.invoiceNumberCounter.findMany({ where: { seriesKey: "FC" } });
      const runs = await Promise.all([
        monthly.generateCommissionStatementsForMonth(MONTH),
        monthly.generateCommissionStatementsForMonth(MONTH),
      ]);
      for (const results of runs) {
        expect(results.find((r) => r.organizationId === statementOrgId)?.outcome).toBe("existing");
      }
      expect(await prisma.commissionStatement.count({ where: { organizationId: statementOrgId } })).toBe(1);
      const fcAfter = await prisma.invoiceNumberCounter.findMany({ where: { seriesKey: "FC" } });
      expect(fcAfter).toEqual(fcBefore);
    });

    it("runs from runBookingMaintenance only on the 1st of the month after 02:00 Paris", async () => {
      // 2 April 2021: not the 1st.
      expect((await monthly.runMonthlyCommissionStatements(new Date("2021-04-02T08:00:00Z"))).ran).toBe(false);
      // 1 April 2021 01:30 Paris (23:30 UTC on 31 March): too early.
      expect((await monthly.runMonthlyCommissionStatements(new Date("2021-03-31T23:30:00Z"))).ran).toBe(false);
      // 1 April 2021 03:00 Paris: runs March, already billed → existing.
      const run = await monthly.runMonthlyCommissionStatements(new Date("2021-04-01T01:00:00Z"));
      expect(run.ran).toBe(true);
      if (run.ran) {
        expect(run.month).toBe(MONTH);
        expect(run.results.find((r) => r.organizationId === statementOrgId)?.outcome).toBe("existing");
      }
      expect(await prisma.commissionStatement.count({ where: { organizationId: statementOrgId } })).toBe(1);
    });

    it("never shows a commission invoice to a client", async () => {
      const statement = await prisma.commissionStatement.findFirstOrThrow({
        where: { organizationId: statementOrgId },
        include: { invoice: true },
      });
      expect(await queries.findClientInvoice(statement.invoice!.id, clientId)).toBeNull();
      expect(await queries.findOrganizationInvoice(statement.invoice!.id, statementOrgId)).not.toBeNull();
    });
  });

  describe("PDF", () => {
    it("renders a valid PDF of an issued invoice, accents and euro sign included", async () => {
      const { buildInvoiceView } = await import("@/server/domains/invoicing/view");
      const { renderInvoicePdf } = await import("@/server/domains/invoicing/pdf");
      const { PDFDocument } = await import("pdf-lib");
      const issued = await issue.issueBookingInvoice((await capturedPayment(vatOrgId)).id);
      const invoice = await queries.findClientInvoice(issued!.id, clientId);
      expect(invoice).not.toBeNull();

      const bytes = await renderInvoicePdf(buildInvoiceView(invoice!));
      expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    });

    it("never serves another client's invoice", async () => {
      const issued = await issue.issueBookingInvoice((await capturedPayment(vatOrgId)).id);
      expect(await queries.findClientInvoice(issued!.id, otherClientId)).toBeNull();
    });
  });
});
