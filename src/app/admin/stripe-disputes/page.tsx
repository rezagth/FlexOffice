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

// Still open — the eventual amount at risk, not yet a realized loss.
const OPEN_STATUSES = new Set([
  "WARNING_NEEDS_RESPONSE",
  "WARNING_UNDER_REVIEW",
  "NEEDS_RESPONSE",
  "UNDER_REVIEW",
]);

export default async function AdminStripeDisputesPage() {
  await requirePageAdmin();
  const disputes = await prisma.stripeDispute.findMany({
    include: {
      payment: { include: { booking: { include: { space: true } }, organization: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const absorbedCents = disputes
    .filter((d) => d.status === "LOST")
    .reduce((sum, d) => sum + d.amountCents, 0);
  const atRiskCents = disputes
    .filter((d) => OPEN_STATUSES.has(d.status))
    .reduce((sum, d) => sum + d.amountCents, 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Litiges Stripe</h1>

      {/* Business decision, not a code comment only support has to trust —
       * see src/server/domains/payments/disputes.ts. Deliberately styled as
       * a standing notice (accent border, always visible), not a tooltip:
       * every chargeback here is money the platform absorbs, and this page
       * is the only place that says so in plain language. */}
      <div className="max-w-lg rounded-2xl border border-accent/30 bg-accent/5 p-4">
        <p className="text-sm font-medium text-accent">
          La plateforme absorbe la perte de chaque contestation perdue
        </p>
        <p className="mt-1 text-sm text-foreground">
          Tant qu&apos;aucun mécanisme de recouvrement auprès du partenaire
          n&apos;existe (pas de reprise automatique sur son compte Stripe
          Connect), un chargeback perdu est une perte nette pour OfficeFlex,
          pas pour l&apos;entreprise partenaire.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Déjà absorbé (perdus)
            </dt>
            <dd className="font-medium text-foreground">{formatCents(absorbedCents)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Exposition en cours
            </dt>
            <dd className="font-medium text-foreground">{formatCents(atRiskCents)}</dd>
          </div>
        </dl>
      </div>

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
