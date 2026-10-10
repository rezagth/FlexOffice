import { requirePageAdmin } from "@/server/auth/page-guards";
import { getAdminPayoutOverview } from "@/server/domains/payouts/queries";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/states";
import { formatCents, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABELS = { PENDING: "En cours", PAID: "Versé", FAILED: "Échec — à relancer" } as const;
const FREQUENCY_LABELS = { WEEKLY: "Chaque semaine", MONTHLY: "Chaque mois" } as const;

export default async function AdminPayoutsPage() {
  await requirePageAdmin();
  const { owed, payouts } = await getAdminPayoutOverview();
  const failed = payouts.filter((payout) => payout.status === "FAILED");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Versements aux bailleurs</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Les versements partent automatiquement (chaque lundi ou le 1er du mois, selon le choix de chaque bailleur),
        une fois le séjour terminé et le délai de signalement de 24 h écoulé. Les frais d&apos;annulation dus par un
        bailleur sont déduits ; un solde négatif est reporté sur le versement suivant.
      </p>

      {failed.length > 0 && (
        <Card className="border-danger p-4">
          <p role="alert" className="text-sm font-medium text-danger">
            {failed.length} versement{failed.length > 1 ? "s" : ""} en échec : le transfert est relancé
            automatiquement toutes les 15 minutes. Vérifiez le compte de paiement du bailleur s&apos;il persiste.
          </p>
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Ce que nous devons verser</h2>
        {owed.length === 0 ? (
          <EmptyState title="Rien à verser" description="Aucun gain en attente de versement." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bailleur</TableHead>
                <TableHead>Fréquence</TableHead>
                <TableHead>Compte de paiement</TableHead>
                <TableHead>Lignes</TableHead>
                <TableHead className="text-right">Solde (€)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {owed.map((row) => (
                <TableRow key={row.organization?.id}>
                  <TableCell>{row.organization?.name ?? "—"}</TableCell>
                  <TableCell>{row.organization ? FREQUENCY_LABELS[row.organization.payoutFrequency] : "—"}</TableCell>
                  <TableCell>{row.organization?.stripeAccountId ? "Prêt" : "À compléter par le bailleur"}</TableCell>
                  <TableCell>{row.lineCount}</TableCell>
                  <TableCell className="text-right">{formatCents(row.amountCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Derniers versements</h2>
        {payouts.length === 0 ? (
          <EmptyState title="Aucun versement" description="Les versements apparaîtront ici." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bailleur</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Émis le</TableHead>
                <TableHead className="text-right">Montant (€)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((payout) => (
                <TableRow key={payout.id}>
                  <TableCell>{payout.organization.name}</TableCell>
                  <TableCell>{formatDateTime(payout.scheduledFor)}</TableCell>
                  <TableCell>
                    {STATUS_LABELS[payout.status]}
                    {payout.failureReason ? ` (${payout.failureReason})` : ""}
                  </TableCell>
                  <TableCell>{payout.paidAt ? formatDateTime(payout.paidAt) : "—"}</TableCell>
                  <TableCell className="text-right">{formatCents(payout.amountCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
