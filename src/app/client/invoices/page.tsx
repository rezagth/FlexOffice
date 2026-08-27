import { getAuthContext } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { formatCents, formatDateTime } from "@/lib/format";

export default async function ClientInvoicesPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null; // layout already redirects unauthenticated users; this guards the brief render race before that redirect completes
  const payments = await prisma.payment.findMany({
    where: { booking: { clientUserId: ctx.userId } },
    include: { booking: { include: { space: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Factures</h1>

      {payments.length === 0 ? (
        <EmptyState
          title="Aucune facture pour l'instant"
          description="Vos factures apparaîtront ici après votre première réservation payée."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {payments.map((payment) => (
            <Card key={payment.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{payment.booking.space.name}</p>
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
