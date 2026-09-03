import { prisma } from "@/server/db/prisma";
import type { AuthContext } from "@/server/auth/rbac";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/states";
import { ButtonLink } from "@/components/ui/button";
import { formatCents } from "@/lib/format";

/**
 * Landlord home, rendered by `/app` when the active mode is LANDLORD.
 *
 * Extracted from the old `/partner/dashboard` page. Every query is scoped by
 * `activeOrgId`, which `getAuthContext()` resolved from an ACTIVE membership
 * on this request — not from the stored column on its own.
 *
 * Figures are shown according to capability rather than mode: an ACCOUNTANT
 * and a MANAGER are both in landlord mode and must not see the same tiles.
 */
export async function LandlordHome({
  ctx,
}: {
  ctx: AuthContext & { activeOrgId: string };
}) {
  const canSeeRevenue = ctx.capabilities.has("landlord:view_revenue");
  const canManageSpaces = ctx.capabilities.has("landlord:manage_spaces");

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [monthRevenue, bookingsCount, spacesCount] = await Promise.all([
    canSeeRevenue
      ? prisma.payment.aggregate({
          where: {
            organizationId: ctx.activeOrgId,
            status: "SUCCEEDED",
            createdAt: { gte: startOfMonth },
          },
          _sum: { netAmountCents: true },
        })
      : Promise.resolve(null),
    prisma.booking.count({
      where: { organizationId: ctx.activeOrgId, createdAt: { gte: startOfMonth } },
    }),
    prisma.space.count({ where: { organizationId: ctx.activeOrgId } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Bonjour {ctx.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Voici l&apos;activité de votre organisation ce mois-ci.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {monthRevenue && (
          <Card className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Revenus du mois
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatCents(monthRevenue._sum.netAmountCents ?? 0)}
            </p>
          </Card>
        )}
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Réservations ce mois-ci
          </p>
          <p className="mt-2 text-2xl font-semibold">{bookingsCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Espaces
          </p>
          <p className="mt-2 text-2xl font-semibold">{spacesCount}</p>
        </Card>
      </div>

      {spacesCount === 0 && canManageSpaces && (
        <EmptyState
          title="Aucun espace pour l'instant"
          description="Créez votre premier espace pour commencer à recevoir des demandes de réservation."
          action={
            <ButtonLink href="/app/landlord/spaces/new" size="sm">
              Créer un espace
            </ButtonLink>
          }
        />
      )}
    </div>
  );
}
