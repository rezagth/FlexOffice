import { z } from "zod";
import { requireCapability } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { withErrorHandling } from "@/server/lib/http";
import { ForbiddenError } from "@/server/lib/errors";
import { CAPTURED_PAYMENT_STATUSES, keptAmounts, settledRefundsSelect } from "@/server/domains/payments/settled-amounts";
import { zonedTimeToUtc } from "@/server/domains/bookings/timezone";
import { getInvoicingConfig } from "@/server/domains/invoicing/config";
import { ACCOUNTING_TIMEZONE } from "@/server/domains/invoicing/paris-time";
import { centsToDecimal, toCsv } from "@/server/domains/invoicing/csv";
import { splitGross, formatVatRate } from "@/server/domains/invoicing/vat";

const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ")
  .optional()
  .or(z.literal("").transform(() => undefined));

const exportQuerySchema = z.object({ from: dateParam, to: dateParam });

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** VAT split of a possibly negative amount (a commission the platform
 * paid back on its own is negative). */
function signedSplit(cents: number, rateBp: number) {
  const split = splitGross(Math.abs(cents), rateBp);
  const sign = cents < 0 ? -1 : 1;
  return { netCents: sign * split.netCents, vatCents: sign * split.vatCents };
}

// GET /api/landlord/accounting/export?from=YYYY-MM-DD&to=YYYY-MM-DD — CSV of
//   the active organization's captured payments in the period (defaults to
//   the last 12 months), one row per payment, with the invoice and credit
//   note numbers and the HT / TVA breakdown. Dates are Paris calendar days,
//   `to` inclusive.
export const GET = withErrorHandling(async (request: Request) => {
  const ctx = await requireCapability("landlord:manage_accounting");
  if (!ctx.activeOrgId) {
    throw new ForbiddenError("Aucune organisation active pour ce compte.");
  }

  const url = new URL(request.url);
  const query = exportQuerySchema.parse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  const fromDate = zonedTimeToUtc(query.from ?? isoDateDaysAgo(365), "00:00", ACCOUNTING_TIMEZONE);
  const toDate = zonedTimeToUtc(nextDay(query.to ?? isoDateDaysAgo(0)), "00:00", ACCOUNTING_TIMEZONE);
  const config = getInvoicingConfig();

  const payments = await prisma.payment.findMany({
    where: {
      organizationId: ctx.activeOrgId,
      status: { in: [...CAPTURED_PAYMENT_STATUSES] },
      OR: [
        { capturedAt: { gte: fromDate, lt: toDate } },
        { capturedAt: null, createdAt: { gte: fromDate, lt: toDate } },
      ],
    },
    include: {
      booking: { include: { space: true, clientUser: true } },
      refunds: settledRefundsSelect,
      invoice: { include: { creditNotes: { select: { number: true }, orderBy: { sequence: "asc" } } } },
    },
    orderBy: [{ capturedAt: "asc" }, { createdAt: "asc" }],
  });

  const header = [
    "Numéro de facture",
    "Date de facture",
    "Espace",
    "Client",
    "Montant TTC (€)",
    "Montant HT (€)",
    "TVA (€)",
    "Taux de TVA",
    "Avoirs",
    "Remboursé TTC (€)",
    "Commission conservée TTC (€)",
    "Commission HT (€)",
    "TVA sur commission (€)",
    "Net reversé (€)",
  ];
  // Amounts net of settled refunds (cancellations, disputes): what the
  // landlord and the platform actually kept.
  const rows = payments.map((payment) => {
    const kept = keptAmounts(payment);
    const commission = signedSplit(kept.commissionCents, config.commissionVatRateBp);
    const invoice = payment.invoice;
    return [
      invoice?.number ?? "En cours d'émission",
      (invoice?.issuedAt ?? payment.capturedAt ?? payment.createdAt).toISOString().slice(0, 10),
      payment.booking.space.name,
      payment.booking.clientUser.name,
      centsToDecimal(payment.amountCents),
      invoice ? centsToDecimal(invoice.netCents) : "",
      invoice ? centsToDecimal(invoice.vatCents) : "",
      invoice ? (invoice.vatExempt ? "Non applicable (art. 293 B du CGI)" : formatVatRate(invoice.vatRateBasisPoints)) : "",
      invoice?.creditNotes.map((note) => note.number).join(" ") ?? "",
      centsToDecimal(kept.refundedCents),
      centsToDecimal(kept.commissionCents),
      centsToDecimal(commission.netCents),
      centsToDecimal(commission.vatCents),
      centsToDecimal(kept.netCents),
    ];
  });

  return new Response(toCsv([header, ...rows]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="officeflex-comptabilite.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
});
