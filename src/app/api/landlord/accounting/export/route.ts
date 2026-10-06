import { requireCapability } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { invoiceNumber } from "@/lib/format";
import { withErrorHandling } from "@/server/lib/http";
import { ForbiddenError } from "@/server/lib/errors";
import { CAPTURED_PAYMENT_STATUSES, keptAmounts, settledRefundsSelect } from "@/server/domains/payments/settled-amounts";

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Euros with a dot decimal, computed only at the export boundary — the
 * stored value stays integer cents everywhere else (officeflex-codebase §9). */
function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2);
}

// GET /api/landlord/accounting/export?from=&to= — CSV of the active
//   organization's payments in the period (defaults to the last 12 months).
export const GET = withErrorHandling(async (request: Request) => {
  const ctx = await requireCapability("landlord:manage_accounting");
  if (!ctx.activeOrgId) {
    throw new ForbiddenError("Aucune organisation active pour ce compte.");
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const fromDate = from ? new Date(from) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const toDate = to ? new Date(to) : new Date();

  const payments = await prisma.payment.findMany({
    where: {
      organizationId: ctx.activeOrgId,
      status: { in: [...CAPTURED_PAYMENT_STATUSES] },
      createdAt: { gte: fromDate, lte: toDate },
    },
    include: { booking: { include: { space: true, clientUser: true } }, refunds: settledRefundsSelect },
    orderBy: { createdAt: "asc" },
  });

  const header = [
    "Numéro de facture",
    "Date",
    "Espace",
    "Client",
    "Montant (€)",
    "Remboursé (€)",
    "Commission (€)",
    "Net reversé (€)",
  ];
  // Amounts net of settled refunds (cancellations, disputes): what the
  // landlord and the platform actually kept.
  const rows = payments.map((payment) => {
    const kept = keptAmounts(payment);
    return [
      invoiceNumber(payment),
      payment.createdAt.toISOString().slice(0, 10),
      payment.booking.space.name,
      payment.booking.clientUser.name,
      centsToEuros(payment.amountCents),
      centsToEuros(kept.refundedCents),
      centsToEuros(kept.commissionCents),
      centsToEuros(kept.netCents),
    ];
  });

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="officeflex-comptabilite.csv"`,
    },
  });
});
