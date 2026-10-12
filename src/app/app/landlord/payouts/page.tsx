import { requirePageLandlordOrg } from "@/server/auth/page-guards";
import { getLandlordPayoutOverview } from "@/server/domains/payouts/queries";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/states";
import { PayoutFrequencyForm } from "@/components/dashboard/payout-frequency-form";
import { formatCents, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABELS = { PENDING: "En cours", PAID: "Versé", FAILED: "À relancer" } as const;
const DAY = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });

type PayoutLineView = {
  id: string;
  kind: "EARNING" | "CANCELLATION_PENALTY";
  amountCents: number;
  booking: { startsAt: Date; space: { name: string } };
};

function LinesTable({ lines }: { lines: PayoutLineView[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Espace</TableHead>
          <TableHead>Créneau</TableHead>
          <TableHead>Nature</TableHead>
          <TableHead className="text-right">Montant</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell>{line.booking.space.name}</TableCell>
            <TableCell>{formatDateTime(line.booking.startsAt)}</TableCell>
            <TableCell>{line.kind === "EARNING" ? "Réservation" : "Frais d'annulation (commission due)"}</TableCell>
            <TableCell className="text-right">{formatCents(line.amountCents)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function LandlordPayoutsPage() {
  const ctx = await requirePageLandlordOrg("landlord:view_revenue");
  const overview = await getLandlordPayoutOverview(ctx.activeOrgId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">Versements</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            MakomSpace encaisse le paiement du locataire et vous le verse une fois le séjour terminé (et le délai de
            signalement de 24 h écoulé), sous déduction de nos frais de service. Tout se suit ici : vous n&apos;avez
            rien à faire.
          </p>
        </div>
        <ButtonLink href="/api/landlord/payouts/export" variant="outline" size="sm">
          Télécharger le détail (CSV)
        </ButtonLink>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">À verser au prochain versement</p>
          <p className="mt-1 text-2xl font-semibold">{formatCents(overview.payableCents)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Prévu le {DAY.format(overview.nextPayoutAt)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Séjours à venir ou en cours</p>
          <p className="mt-1 text-2xl font-semibold">{formatCents(overview.upcomingCents)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Payable après la fin du séjour</p>
        </Card>
        <Card className="p-5">
          <PayoutFrequencyForm
            initialFrequency={overview.frequency}
            canEdit={ctx.capabilities.has("landlord:manage_organization")}
          />
        </Card>
      </div>

      {overview.openLines.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Pas encore versé</h2>
          <LinesTable lines={overview.openLines} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Versements effectués</h2>
        {overview.payouts.length === 0 ? (
          <EmptyState
            title="Aucun versement pour l'instant"
            description="Votre premier versement apparaîtra ici après la fin d'un premier séjour."
          />
        ) : (
          overview.payouts.map((payout) => (
            <Card key={payout.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">Versement du {DAY.format(payout.scheduledFor)}</p>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_LABELS[payout.status]}
                    {payout.paidAt ? ` · émis le ${formatDateTime(payout.paidAt)}` : ""}
                  </p>
                </div>
                <p className="text-lg font-semibold">{formatCents(payout.amountCents)}</p>
              </div>
              <LinesTable lines={payout.lines} />
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
