import { getAuthContext } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/format";

export default async function AdminDashboardPage() {
  if (!(await getAuthContext())) return null; // layout already enforces the role; this guards the brief render race before that redirect completes

  const [organizationsCount, activeSpacesCount, bookingsCount, revenue] =
    await Promise.all([
      prisma.organization.count(),
      prisma.space.count({ where: { status: "PUBLISHED" } }),
      prisma.booking.count(),
      prisma.payment.aggregate({
        where: { status: "SUCCEEDED" },
        _sum: { commissionAmountCents: true },
      }),
    ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Vue d&apos;ensemble</h1>
        <p className="text-sm text-muted-foreground">
          Indicateurs globaux de la plateforme OfficeFlex.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Entreprises inscrites
          </p>
          <p className="mt-2 text-2xl font-semibold">{organizationsCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Espaces actifs
          </p>
          <p className="mt-2 text-2xl font-semibold">{activeSpacesCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Réservations totales
          </p>
          <p className="mt-2 text-2xl font-semibold">{bookingsCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Chiffre d&apos;affaires plateforme
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatCents(revenue._sum.commissionAmountCents ?? 0)}
          </p>
        </Card>
      </div>
    </div>
  );
}
