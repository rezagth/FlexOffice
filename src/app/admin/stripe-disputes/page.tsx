import { requirePageAdmin } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { formatCents, formatDateTime } from "@/lib/format";

// Real Stripe chargebacks — distinct from /admin/disputes, which lists
// app-level booking complaints (client vs. partner). The platform absorbs
// chargeback losses (confirmed business decision): this page is visibility
// only, no action buttons — see src/server/domains/payments/disputes.ts.
const STRIPE_DISPUTE_STATUS_LABELS: Record<string, string> = {
  WARNING_NEEDS_RESPONSE: "Avertissement — réponse attendue",
  WARNING_UNDER_REVIEW: "Avertissement — en cours d'examen",
  WARNING_CLOSED: "Avertissement — clos",
  NEEDS_RESPONSE: "Réponse attendue",
  UNDER_REVIEW: "En cours d'examen",
  CHARGE_REFUNDED: "Paiement remboursé",
  WON: "Gagné",
  LOST: "Perdu",
};

export const dynamic = "force-dynamic";

export default async function AdminStripeDisputesPage() {
  await requirePageAdmin();
  const disputes = await prisma.stripeDispute.findMany({
    include: {
      payment: { include: { booking: { include: { space: true } }, organization: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Litiges Stripe</h1>
      <p className="max-w-lg text-sm text-muted-foreground">
        Contestations de paiement (chargebacks) remontées par Stripe. La
        plateforme absorbe la perte : aucune reprise automatique sur le
        compte du partenaire.
      </p>

      {disputes.length === 0 ? (
        <EmptyState
          title="Aucun litige Stripe pour l'instant"
          description="Les contestations de paiement remontées par Stripe apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {disputes.map((dispute) => (
            <Card key={dispute.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-foreground">
                  {dispute.payment.booking.space.name} · {dispute.payment.organization.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(dispute.createdAt)} · Motif : {dispute.reason}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium text-foreground">{formatCents(dispute.amountCents)}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {STRIPE_DISPUTE_STATUS_LABELS[dispute.status] ?? dispute.status}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
