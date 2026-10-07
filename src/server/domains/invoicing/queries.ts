import { prisma } from "@/server/db/prisma";

/**
 * Access-scoped reads of invoicing documents. Ownership is part of every
 * `where` (officeflex-security-guardrails §4): a document outside the
 * caller's scope is simply not found, which the routes turn into a 404 —
 * never a 403 that would confirm it exists.
 */

const withCredited = { creditedInvoice: { select: { number: true, issuedAt: true } } } as const;

/** A booking invoice or credit note of one of the client's own bookings.
 * Commission invoices are between the platform and the landlord: never
 * visible to a client. */
export function findClientInvoice(invoiceId: string, clientUserId: string) {
  return prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      OR: [
        { kind: "INVOICE", payment: { booking: { clientUserId } } },
        { kind: "CREDIT_NOTE", refund: { payment: { booking: { clientUserId } } } },
      ],
    },
    include: withCredited,
  });
}

/** Any document of the organization: the invoices issued in its name and
 * the commission invoices addressed to it. */
export function findOrganizationInvoice(invoiceId: string, organizationId: string) {
  return prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: withCredited,
  });
}

/** Platform administration: any document. */
export function findInvoiceForAdmin(invoiceId: string) {
  return prisma.invoice.findUnique({ where: { id: invoiceId }, include: withCredited });
}

/** Documents of one payment (its invoice, then its credit notes), for the
 * detail pages. */
export async function listPaymentDocuments(paymentId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { paymentId }, include: withCredited });
  if (!invoice) return [];
  const creditNotes = await prisma.invoice.findMany({
    where: { creditedInvoiceId: invoice.id, kind: "CREDIT_NOTE" },
    include: withCredited,
    orderBy: [{ issuedAt: "asc" }, { sequence: "asc" }],
  });
  return [invoice, ...creditNotes];
}
