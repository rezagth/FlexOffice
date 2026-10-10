import { Prisma, type Invoice } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { logError, logEvent } from "@/server/lib/logger";
import { CAPTURED_PAYMENT_STATUSES } from "@/server/domains/payments/settled-amounts";
import { getInvoicingConfig } from "./config";
import { allocateInvoiceNumber, InvoiceYearRolloverError, landlordSeries, type InvoiceSeries } from "./numbering";
import { parseParty, type InvoiceLine, type PartySnapshot } from "./types";
import { exemptAmount, rentalVat, splitGross, type VatBreakdown } from "./vat";

/**
 * Issuance of the booking documents (assumption H2):
 *   - INVOICE      when a payment is captured, in the landlord's series,
 *                  issued by the platform in the landlord's name (mandate);
 *   - CREDIT_NOTE  when a refund is settled, same series, linked to it.
 *
 * Every function here is idempotent — `payment_id` / `refund_id` are unique
 * on `invoices` — and safe under concurrency: the loser of a race rolls its
 * whole transaction back, counter increment included, and returns the
 * winner's document. Callers on the payment path use
 * `issueInvoiceDocumentsSafely`, which never throws: a failed issuance must
 * not fail a capture, and the maintenance sweep issues what was missed.
 */

const ISSUE_TRANSACTION_OPTIONS = { timeout: 15_000, maxWait: 10_000 } as const;

type OrganizationIdentity = {
  id: string;
  name: string;
  legalName: string | null;
  siret: string | null;
  vatNumber: string | null;
  address: string;
  postalCode: string;
  city: string;
  email: string;
};

export function organizationSnapshot(organization: OrganizationIdentity): PartySnapshot {
  return {
    name: organization.name,
    legalName: organization.legalName?.trim() || null,
    siret: organization.siret,
    vatNumber: organization.vatNumber?.trim() || null,
    address: organization.address,
    postalCode: organization.postalCode,
    city: organization.city,
    email: organization.email,
  };
}

function clientSnapshot(client: {
  name: string;
  email: string;
  activeOrganization: { name: string; legalName: string | null } | null;
}): PartySnapshot {
  return {
    name: client.name,
    email: client.email,
    organizationName: client.activeOrganization
      ? client.activeOrganization.legalName?.trim() || client.activeOrganization.name
      : null,
  };
}

/** "lundi 12 octobre 2026, 09:00 – 13:00 (Europe/Paris)" — rendered once,
 * at issuance, in the space's own time zone. */
export function formatSlot(startsAt: Date, endsAt: Date, timeZone: string): string {
  const day = startsAt.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  });
  const time = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone });
  return `${day}, ${time(startsAt)} – ${time(endsAt)} (${timeZone})`;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Inserts a document under a freshly allocated number, in one transaction.
 * Retries once on a year rollover (see numbering.ts). */
async function insertNumbered(
  series: InvoiceSeries,
  data: (allocated: { year: number; sequence: number; number: string; issuedAt: Date }) => Omit<Prisma.InvoiceUncheckedCreateInput, "seriesKey" | "year" | "sequence" | "number" | "issuedAt">
): Promise<Invoice> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const allocated = await allocateInvoiceNumber(tx, series);
        return tx.invoice.create({
          data: {
            ...data(allocated),
            seriesKey: series.key,
            year: allocated.year,
            sequence: allocated.sequence,
            number: allocated.number,
            issuedAt: allocated.issuedAt,
          },
        });
      }, ISSUE_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof InvoiceYearRolloverError && attempt === 0) continue;
      throw error;
    }
  }
}

const paymentForInvoice = {
  include: {
    organization: true,
    booking: { include: { space: true, clientUser: { include: { activeOrganization: true } } } },
  },
} satisfies Prisma.PaymentDefaultArgs;

/** The booking invoice of a captured payment — issued on first call. */
export async function issueBookingInvoice(paymentId: string): Promise<Invoice | null> {
  const existing = await prisma.invoice.findUnique({ where: { paymentId } });
  if (existing) return existing;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, ...paymentForInvoice });
  if (!payment || !(CAPTURED_PAYMENT_STATUSES as readonly string[]).includes(payment.status)) return null;

  const config = getInvoicingConfig();
  const { organization, booking } = payment;
  const vat: VatBreakdown = rentalVat(payment.amountCents, organization.vatNumber, config.rentalVatRateBp);
  const line: InvoiceLine = {
    description: `Mise à disposition de l'espace « ${booking.space.name} »`,
    detail: `${formatSlot(booking.startsAt, booking.endsAt, booking.space.timezone)} — ${booking.space.address}, ${booking.space.postalCode} ${booking.space.city}`,
    reference: null,
    totalCents: payment.amountCents,
  };

  try {
    const invoice = await insertNumbered(landlordSeries(organization.id, config.invoicePrefix), () => ({
      kind: "INVOICE",
      organizationId: organization.id,
      paymentId: payment.id,
      seller: organizationSnapshot(organization),
      buyer: clientSnapshot(booking.clientUser),
      lines: [line],
      ...vat,
      serviceFeeCents: payment.commissionAmountCents,
    }));
    logEvent({ event: "invoicing.invoice_issued", organization_id: organization.id, invoice_id: invoice.id, payment_id: payment.id });
    return invoice;
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Issued concurrently by another caller; our transaction (and its
      // counter increment) was rolled back.
      const winner = await prisma.invoice.findUnique({ where: { paymentId } });
      if (winner) return winner;
    }
    throw error;
  }
}

/** The credit note of a settled refund — issued on first call, after the
 * invoice it credits. */
export async function issueCreditNote(refundId: string): Promise<Invoice | null> {
  const existing = await prisma.invoice.findUnique({ where: { refundId } });
  if (existing) return existing;

  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { payment: { include: { organization: true } } },
  });
  if (!refund || refund.status !== "SUCCEEDED") return null;

  const invoice = await issueBookingInvoice(refund.paymentId);
  if (!invoice) return null;

  const config = getInvoicingConfig();
  const { payment } = refund;
  // Same VAT regime as the invoice being credited, whatever the landlord's
  // situation is today.
  const vat = invoice.vatExempt ? exemptAmount(refund.amountCents) : splitGross(refund.amountCents, invoice.vatRateBasisPoints);
  const serviceFeeCents = refund.applicationFeeRefunded ? Math.min(payment.commissionAmountCents, refund.amountCents) : 0;
  const line: InvoiceLine = {
    description: `Remboursement sur la facture ${invoice.number}`,
    detail: refund.reason,
    reference: invoice.number,
    totalCents: refund.amountCents,
  };
  const buyer = parseParty(invoice.buyer);

  try {
    const creditNote = await insertNumbered(landlordSeries(payment.organizationId, config.invoicePrefix), () => ({
      kind: "CREDIT_NOTE",
      organizationId: payment.organizationId,
      refundId: refund.id,
      creditedInvoiceId: invoice.id,
      seller: organizationSnapshot(payment.organization),
      // The customer of the credited invoice — even if the account has been
      // anonymized since (GDPR), the credit note is addressed to the party
      // the invoice was.
      buyer: buyer ?? { name: "Client" },
      lines: [line],
      ...vat,
      serviceFeeCents,
    }));
    logEvent({ event: "invoicing.credit_note_issued", organization_id: payment.organizationId, invoice_id: creditNote.id, refund_id: refund.id });
    return creditNote;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await prisma.invoice.findUnique({ where: { refundId } });
      if (winner) return winner;
    }
    throw error;
  }
}

/** Invoice of a captured payment plus a credit note for each of its settled
 * refunds, in refund order. Idempotent. */
export async function ensureInvoiceDocumentsForPayment(paymentId: string) {
  const invoice = await issueBookingInvoice(paymentId);
  if (!invoice) return { invoice: null, creditNotes: [] as Invoice[] };
  const refunds = await prisma.refund.findMany({
    where: { paymentId, status: "SUCCEEDED", invoice: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const creditNotes: Invoice[] = [];
  for (const refund of refunds) {
    const creditNote = await issueCreditNote(refund.id);
    if (creditNote) creditNotes.push(creditNote);
  }
  return { invoice, creditNotes };
}

/**
 * For the payment and refund paths (capture, refund settlement): issues the
 * documents and never throws — the money movement already happened and
 * must not be reported as failed because a document could not be numbered.
 * The maintenance sweep (`issueMissingInvoiceDocuments`) catches up.
 */
export async function issueInvoiceDocumentsSafely(paymentId: string) {
  try {
    await ensureInvoiceDocumentsForPayment(paymentId);
  } catch (error) {
    logError({ event: "invoicing.issue_failed", error, payment_id: paymentId });
  }
}

/**
 * Catch-up, run by the maintenance job: every captured payment without an
 * invoice (payments captured before this feature, or a failed issuance) and
 * every settled refund without a credit note, oldest first so numbers
 * follow the order of the underlying events as closely as possible.
 */
export async function issueMissingInvoiceDocuments(limit = 200) {
  const payments = await prisma.payment.findMany({
    where: { status: { in: [...CAPTURED_PAYMENT_STATUSES] }, invoice: null },
    orderBy: [{ capturedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: limit,
    select: { id: true },
  });
  const refunds = await prisma.refund.findMany({
    where: { status: "SUCCEEDED", invoice: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { paymentId: true },
  });

  const paymentIds = [...new Set([...payments.map((p) => p.id), ...refunds.map((r) => r.paymentId)])];
  let failed = 0;
  for (const paymentId of paymentIds) {
    try {
      await ensureInvoiceDocumentsForPayment(paymentId);
    } catch (error) {
      failed += 1;
      logError({ event: "invoicing.catch_up_failed", error, payment_id: paymentId });
    }
  }
  if (paymentIds.length > 0) logEvent({ event: "invoicing.catch_up_run", payments: paymentIds.length, failed });
  return { payments: paymentIds.length, failed };
}
