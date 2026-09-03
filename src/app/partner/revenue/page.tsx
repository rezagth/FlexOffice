import { requirePageOrg } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/format";

export default async function PartnerRevenuePage() {
  const ctx = await requirePageOrg();
  const totals = await prisma.payment.aggregate({
    where: { organizationId: ctx.organizationId, status: "SUCCEEDED" },
    _sum: { amountCents: true, commissionAmountCents: true, netAmountCents: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Revenus</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Revenu brut
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatCents(totals._sum.amountCents ?? 0)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Commission OfficeFlex
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatCents(totals._sum.commissionAmountCents ?? 0)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Revenu net reversé
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatCents(totals._sum.netAmountCents ?? 0)}
          </p>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground">
        Le calcul du taux d&apos;occupation et du potentiel de revenu inexploité
        arrive dans une prochaine itération, une fois le calendrier de disponibilité
        implémenté.
      </p>
    </div>
  );
}
