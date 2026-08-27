import { getAuthContext } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { ButtonLink } from "@/components/ui/button";
import { formatCents } from "@/lib/format";

export default async function PartnerDashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx?.organizationId) return null; // layout already redirects non-PARTNER; this guards the brief render race before that redirect completes

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [monthRevenue, bookingsCount, spacesCount] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        organizationId: ctx.organizationId,
        status: "SUCCEEDED",
        createdAt: { gte: startOfMonth },
      },
      _sum: { netAmountCents: true },
    }),
    prisma.booking.count({
      where: { organizationId: ctx.organizationId, createdAt: { gte: startOfMonth } },
    }),
    prisma.space.count({ where: { organizationId: ctx.organizationId } }),
  ]);

  const revenue = formatCents(monthRevenue._sum.netAmountCents ?? 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Bonjour {ctx.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Voici l&apos;activité de votre entreprise ce mois-ci.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Revenus du mois
          </p>
          <p className="mt-2 text-2xl font-semibold">{revenue}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Réservations ce mois-ci
          </p>
          <p className="mt-2 text-2xl font-semibold">{bookingsCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Espaces publiés
          </p>
          <p className="mt-2 text-2xl font-semibold">{spacesCount}</p>
        </Card>
      </div>

      {spacesCount === 0 && (
        <EmptyState
          title="Aucun espace publié pour l'instant"
          description="Publiez votre premier espace pour commencer à recevoir des demandes de réservation."
          action={
            <ButtonLink href="/partner/spaces" size="sm">
              Publier un espace
            </ButtonLink>
          }
        />
      )}
    </div>
  );
}
