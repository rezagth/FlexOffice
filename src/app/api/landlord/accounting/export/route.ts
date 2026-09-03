import { requireCapability } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { invoiceNumber } from "@/lib/format";
import { withErrorHandling } from "@/server/lib/http";
import { ForbiddenError } from "@/server/lib/errors";

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
      status: "SUCCEEDED",
      createdAt: { gte: fromDate, lte: toDate },
    },
    include: { booking: { include: { space: true, clientUser: true } } },
    orderBy: { createdAt: "asc" },
  });

  const header = [
    "Numéro de facture",
    "Date",
    "Espace",
    "Client",
    "Montant (€)",
    "Commission (€)",
    "Net reversé (€)",
  ];
  const rows = payments.map((payment) => [
    invoiceNumber(payment),
    payment.createdAt.toISOString().slice(0, 10),
    payment.booking.space.name,
    payment.booking.clientUser.name,
    centsToEuros(payment.amountCents),
    centsToEuros(payment.commissionAmountCents),
    centsToEuros(payment.netAmountCents),
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="officeflex-comptabilite.csv"`,
    },
  });
});
