import Stripe from "stripe";
import { Prisma, type CommissionStatement } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { notifyCommissionStatementIssued } from "@/server/domains/notifications/send-notifications";
import { logError, logEvent } from "@/server/lib/logger";
import { getInvoicingConfig } from "@/server/domains/invoicing/config";
import { issueBookingInvoice, organizationSnapshot } from "@/server/domains/invoicing/issue";
import { allocateInvoiceNumber, commissionSeries, InvoiceYearRolloverError } from "@/server/domains/invoicing/numbering";
import { parseLines, type InvoiceLine } from "@/server/domains/invoicing/types";
import { splitGross } from "@/server/domains/invoicing/vat";
import { CAPTURED_PAYMENT_STATUSES, keptAmounts, settledRefundsSelect } from "./settled-amounts";

/**
 * Monthly commission statement of one landlord organization (assumption H3).
 *
 * The legal document is the platform's COMMISSION_INVOICE (series FC),
 * issued in our own database in the same transaction that claims the
 * statement row. Stripe Invoicing only MIRRORS it afterwards — a finalized
 * invoice marked `paid_out_of_band`, because the commission was already
 * collected at capture time through the destination-charge split: a
 * retrospective record, never a new collection attempt.
 *
 * Order matters:
 *   1. claim the (organization, month) row + issue the FC invoice, one
 *      transaction. `@@unique([organizationId, periodStart])` makes a second
 *      run (cron overlap, admin double-click) a no-op returning the first
 *      row — and its rolled-back counter increment leaves no gap;
 *   2. mirror to Stripe, outside any transaction. A failure is recorded on
 *      the row (stripeSyncError) and retried by the maintenance job; it
 *      never un-issues the document. Before this order was used, Stripe was
 *      called first and two concurrent runs created two Stripe invoices.
 *
 * Amounts are the commission KEPT after settled refunds (settled-amounts),
 * VAT included at COMMISSION_VAT_RATE.
 */
export async function generateMonthlyCommissionStatement(
  organizationId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<CommissionStatement | null> {
  const existing = await prisma.commissionStatement.findUnique({
    where: { organizationId_periodStart: { organizationId, periodStart } },
  });
  if (existing) return existing;

  const payments = await prisma.payment.findMany({
    where: {
      organizationId,
      status: { in: [...CAPTURED_PAYMENT_STATUSES] },
      capturedAt: { gte: periodStart, lt: periodEnd },
    },
    include: { booking: { include: { space: true } }, refunds: settledRefundsSelect },
    orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
  });
  // The commission actually kept: 0 after a landlord cancellation or a full
  // dispute refund (commission refunded), unchanged after a client
  // cancellation (non-refundable service fee). Nothing to invoice at 0.
  const billable = payments
    .map((payment) => ({ payment, commissionCents: keptAmounts(payment).commissionCents }))
    .filter(({ commissionCents }) => commissionCents > 0);
  if (billable.length === 0) return null;

  // Each line references the booking invoice it relates to. Issued here if
  // the capture-time issuance had not run yet (best effort: a missing
  // reference does not block the commission invoice).
  const lines: InvoiceLine[] = [];
  for (const { payment, commissionCents } of billable) {
    const bookingInvoice = await issueBookingInvoice(payment.id).catch((error) => {
      logError({ event: "invoicing.reference_issue_failed", error, payment_id: payment.id });
      return null;
    });
    lines.push({
      description: `Commission d'intermédiation — ${payment.booking.space.name}`,
      detail: `Réservation du ${payment.booking.startsAt.toLocaleDateString("fr-FR", { timeZone: payment.booking.space.timezone })}`,
      reference: bookingInvoice?.number ?? null,
      totalCents: commissionCents,
    });
  }

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const config = getInvoicingConfig();
  const totalCommissionAmountCents = billable.reduce((sum, { commissionCents }) => sum + commissionCents, 0);
  // VAT computed once on the total (not per line, then summed): the
  // document shows one VAT amount that is exactly TTC − HT.
  const vat = splitGross(totalCommissionAmountCents, config.commissionVatRateBp);
  const series = commissionSeries(config.commissionInvoicePrefix);

  let statement: CommissionStatement;
  try {
    statement = await claimStatementWithInvoice(async (tx) => {
      const created = await tx.commissionStatement.create({
        data: { organizationId, periodStart, periodEnd, totalCommissionAmountCents },
      });
      const allocated = await allocateInvoiceNumber(tx, series);
      await tx.invoice.create({
        data: {
          kind: "COMMISSION_INVOICE",
          seriesKey: series.key,
          year: allocated.year,
          sequence: allocated.sequence,
          number: allocated.number,
          issuedAt: allocated.issuedAt,
          organizationId,
          commissionStatementId: created.id,
          seller: Prisma.DbNull,
          buyer: organizationSnapshot(organization),
          lines,
          ...vat,
        },
      });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Claimed concurrently: return the row that won.
      return prisma.commissionStatement.findUniqueOrThrow({
        where: { organizationId_periodStart: { organizationId, periodStart } },
      });
    }
    throw error;
  }

  await recordAudit({
    event: "commission_statement.generated",
    organizationId,
    metadata: { statementId: statement.id, totalCommissionAmountCents },
  });
  // E-mailed once, when the statement first exists (manual run or the
  // monthly job) — best effort, never blocks the statement.
  await notifyCommissionStatementIssued(statement.id);

  if (isStripeMirrorEnabled()) {
    return (await syncCommissionStatementToStripe(statement.id)) ?? statement;
  }
  return statement;
}

async function claimStatementWithInvoice(
  work: (tx: Prisma.TransactionClient) => Promise<CommissionStatement>
): Promise<CommissionStatement> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(work, { timeout: 15_000, maxWait: 10_000 });
    } catch (error) {
      if (error instanceof InvoiceYearRolloverError && attempt === 0) continue;
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Stripe mirror
// ---------------------------------------------------------------------------

/** The mirror runs only on a real-payment instance: on the mock provider
 * there is no Stripe account to mirror into, and the FC invoice alone is
 * the document. */
export function isStripeMirrorEnabled(): boolean {
  return process.env.PAYMENT_PROVIDER === "stripe" && Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(secretKey, { apiVersion: "2026-08-26.dahlia" });
}

/** Creates the Stripe Customer on first call; returns the existing one on
 * every later call. This is the org as a bill-to party for commission
 * statements — distinct from Organization.stripeAccountId, its Connect
 * payee id. */
async function getOrCreateCustomerId(stripe: Stripe, organizationId: string): Promise<string> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { id: true, stripeCustomerId: true, name: true, legalName: true, email: true },
  });
  if (organization.stripeCustomerId) return organization.stripeCustomerId;

  const customer = await stripe.customers.create(
    {
      name: organization.legalName?.trim() || organization.name,
      email: organization.email,
      metadata: { organizationId: organization.id },
    },
    { idempotencyKey: `org-customer-${organization.id}` }
  );
  await prisma.organization.update({ where: { id: organizationId }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

const TAX_RATE_PURPOSE = "officeflex_commission_vat";
const taxRateCache = new Map<number, string>();

/**
 * The Stripe tax rate for the commission: inclusive (amounts are TTC),
 * COMMISSION_VAT_RATE. Taken from STRIPE_COMMISSION_TAX_RATE_ID when set,
 * otherwise found by its metadata or created once.
 */
export async function getCommissionTaxRateId(stripe: Stripe, rateBp: number): Promise<string> {
  const configured = process.env.STRIPE_COMMISSION_TAX_RATE_ID?.trim();
  if (configured) return configured;
  const cached = taxRateCache.get(rateBp);
  if (cached) return cached;

  const percentage = rateBp / 100;
  const list = await stripe.taxRates.list({ active: true, inclusive: true, limit: 100 });
  const found = list.data.find(
    (rate) => rate.metadata?.purpose === TAX_RATE_PURPOSE && rate.percentage === percentage
  );
  const id =
    found?.id ??
    (
      await stripe.taxRates.create(
        {
          display_name: "TVA",
          description: "TVA sur la commission OfficeFlex",
          percentage,
          inclusive: true,
          country: "FR",
          jurisdiction: "FR",
          metadata: { purpose: TAX_RATE_PURPOSE },
        },
        { idempotencyKey: `commission-vat-${rateBp}` }
      )
    ).id;
  taxRateCache.set(rateBp, id);
  return id;
}

/** Test-only. */
export function resetCommissionTaxRateCacheForTests() {
  taxRateCache.clear();
}

/**
 * Mirrors one statement's FC invoice into Stripe. Resumable at every step:
 * pending items already created for this statement are not created again
 * (looked up by metadata, plus Stripe idempotency keys), an invoice id
 * already stored is retrieved rather than re-created, and finalize / pay
 * run only from the state that needs them. Returns the updated row, or
 * null when the mirror failed (error recorded on the row).
 */
export async function syncCommissionStatementToStripe(statementId: string): Promise<CommissionStatement | null> {
  const statement = await prisma.commissionStatement.findUnique({
    where: { id: statementId },
    include: { invoice: true },
  });
  if (!statement || !statement.invoice) return null;
  if (statement.stripeSyncedAt) return statement;
  const { invoice } = statement;

  try {
    const stripe = getStripeClient();
    const customerId = await getOrCreateCustomerId(stripe, statement.organizationId);
    const taxRateId = await getCommissionTaxRateId(stripe, invoice.vatRateBasisPoints);
    const lines = parseLines(invoice.lines);

    let stripeInvoiceId = statement.stripeInvoiceId;
    if (!stripeInvoiceId) {
      const pending = await stripe.invoiceItems.list({ customer: customerId, pending: true, limit: 100 });
      const alreadyCreated = new Set(
        pending.data
          .filter((item) => item.metadata?.commissionStatementId === statement.id)
          .map((item) => item.metadata?.line)
      );
      for (const [index, line] of lines.entries()) {
        if (alreadyCreated.has(String(index))) continue;
        await stripe.invoiceItems.create(
          {
            customer: customerId,
            currency: "eur",
            amount: line.totalCents,
            description: [line.description, line.reference ? `(facture ${line.reference})` : null].filter(Boolean).join(" "),
            tax_rates: [taxRateId],
            metadata: { commissionStatementId: statement.id, line: String(index) },
          },
          { idempotencyKey: `cs-${statement.id}-item-${index}` }
        );
      }

      const created = await stripe.invoices.create(
        {
          customer: customerId,
          collection_method: "send_invoice",
          days_until_due: 0,
          auto_advance: false,
          // Without this, invoices.create() does NOT pull in the invoice
          // items just created above — confirmed against the real test API.
          pending_invoice_items_behavior: "include",
          description: `Relevé de commission — facture ${invoice.number}`,
          footer: `Document de référence : facture ${invoice.number} émise par OfficeFlex. Commission déjà prélevée lors de l'encaissement des réservations.`,
          metadata: { commissionStatementId: statement.id, invoiceNumber: invoice.number },
        },
        { idempotencyKey: `cs-${statement.id}-invoice` }
      );
      stripeInvoiceId = created.id!;
      await prisma.commissionStatement.update({ where: { id: statement.id }, data: { stripeInvoiceId } });
    }

    let current = await stripe.invoices.retrieve(stripeInvoiceId);
    if (current.status === "draft") current = await stripe.invoices.finalizeInvoice(stripeInvoiceId);
    // With days_until_due: 0, Stripe can mark a finalized invoice paid on
    // its own (observed in test mode) — pay() on an already-paid invoice is
    // a real Stripe error, so only call it when the invoice is still open.
    if (current.status === "open") current = await stripe.invoices.pay(stripeInvoiceId, { paid_out_of_band: true });

    const updated = await prisma.commissionStatement.update({
      where: { id: statement.id },
      data: {
        stripeSyncedAt: new Date(),
        stripeSyncError: null,
        hostedInvoiceUrl: current.hosted_invoice_url ?? null,
        invoicePdfUrl: current.invoice_pdf ?? null,
      },
    });
    logEvent({ event: "commission_statement.stripe_synced", statement_id: statement.id, stripe_invoice_id: stripeInvoiceId });
    return updated;
  } catch (error) {
    logError({ event: "commission_statement.stripe_sync_failed", error, statement_id: statement.id });
    await prisma.commissionStatement.update({
      where: { id: statement.id },
      data: { stripeSyncError: error instanceof Error ? error.message.slice(0, 500) : "Erreur inconnue" },
    });
    return null;
  }
}

/** Retries the Stripe mirror of every statement not yet synced. */
export async function syncPendingCommissionStatements(limit = 50) {
  if (!isStripeMirrorEnabled()) return { candidates: 0, synced: 0 };
  const pending = await prisma.commissionStatement.findMany({
    where: { stripeSyncedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let synced = 0;
  for (const { id } of pending) {
    if (await syncCommissionStatementToStripe(id)) synced += 1;
  }
  return { candidates: pending.length, synced };
}
