import { requirePageAdmin } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { formatCents, formatDateTime } from "@/lib/format";

export default async function AdminPaymentsPage() {
  await requirePageAdmin();
  const payments = await prisma.payment.findMany({
    include: { organization: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Paiements</h1>
      <p className="max-w-lg text-sm text-muted-foreground">
        Le suivi des remboursements et des reversements détaillés arrive dans une
        prochaine itération (intégration Stripe Connect réelle).
      </p>

      {payments.length === 0 ? (
        <EmptyState
          title="Aucun paiement pour l'instant"
          description="Les paiements des réservations apparaîtront ici."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {payments.map((payment) => (
            <Card key={payment.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{payment.organization.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(payment.createdAt)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{formatCents(payment.amountCents)}</p>
                <p className="text-xs text-muted-foreground">{payment.status}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
