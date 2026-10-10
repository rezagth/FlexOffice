import { requireOrgCapability } from "@/server/domains/organizations/require-org-capability";
import { prisma } from "@/server/db/prisma";
import { withErrorHandling } from "@/server/lib/http";
import { centsToDecimal, toCsv } from "@/server/domains/invoicing/csv";

const KIND_LABELS = { EARNING: "Réservation", CANCELLATION_PENALTY: "Frais d'annulation (commission due)" } as const;

// GET /api/landlord/payouts/export — CSV of every payout line of the active
// organization, one row per booking (or penalty), with the payout it belongs
// to. Auth: landlord:view_revenue.
export const GET = withErrorHandling(async () => {
  const ctx = await requireOrgCapability("landlord:view_revenue");
  const lines = await prisma.payoutLine.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      payout: { select: { scheduledFor: true, status: true } },
      booking: { select: { startsAt: true, endsAt: true, space: { select: { name: true } } } },
    },
    orderBy: [{ eligibleAt: "asc" }, { createdAt: "asc" }],
  });
  const rows = [
    ["Versement du", "Statut du versement", "Type", "Espace", "Début du créneau", "Fin du créneau", "Montant (€)"],
    ...lines.map((line) => [
      line.payout?.scheduledFor.toISOString().slice(0, 10) ?? "À venir",
      line.payout ? (line.payout.status === "PAID" ? "Versé" : "En cours") : "Pas encore versé",
      KIND_LABELS[line.kind],
      line.booking.space.name,
      line.booking.startsAt.toISOString(),
      line.booking.endsAt.toISOString(),
      centsToDecimal(line.amountCents),
    ]),
  ];
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="versements.csv"',
      "cache-control": "no-store",
    },
  });
});
