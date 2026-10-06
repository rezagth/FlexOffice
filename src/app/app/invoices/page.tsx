import Link from "next/link";
import { requirePageAuth } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { formatCents, formatDateTime, PAYMENT_STATUS_LABELS } from "@/lib/format";

export default async function ClientInvoicesPage() {
  const ctx = await requirePageAuth();
  const payments = await prisma.payment.findMany({
    // Only money actually taken: an authorization that was released (refused,
    // expired, cancelled) has no receipt to show.
    where: {
      booking: { clientUserId: ctx.userId },
      status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] },
    },
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
            <Link key={payment.id} href={`/app/invoices/${payment.id}`} className="block">
              <Card className="flex items-center justify-between p-4 transition-colors hover:bg-muted">
                <div>
                  <p className="font-medium">{payment.booking.space.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(payment.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{formatCents(payment.amountCents)}</p>
                  <p className="text-xs text-muted-foreground">{PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
