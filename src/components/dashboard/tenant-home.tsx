import Link from "next/link";
import { prisma } from "@/server/db/prisma";
import type { AuthContext } from "@/server/auth/rbac";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/states";
import { formatCents, formatDateTime } from "@/lib/format";

/**
 * Tenant home, rendered by `/app` when the active mode is TENANT.
 *
 * Extracted from the old `/client/dashboard` page unchanged in substance:
 * `/app` has to pick between two homes at request time, and a Server
 * Component cannot be a route. Every query is still scoped by
 * `ctx.userId` from the verified session.
 */
export async function TenantHome({ ctx }: { ctx: AuthContext }) {
  const [nextBooking, totalBookings, spend, favoritesCount] = await Promise.all([
    prisma.booking.findFirst({
      where: {
        clientUserId: ctx.userId,
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { gte: new Date() },
      },
      orderBy: { startsAt: "asc" },
      include: { space: true },
    }),
    prisma.booking.count({ where: { clientUserId: ctx.userId } }),
    prisma.booking.aggregate({
      where: { clientUserId: ctx.userId, status: { in: ["CONFIRMED", "COMPLETED"] } },
      _sum: { priceAmountCents: true },
    }),
    prisma.favorite.count({ where: { userId: ctx.userId } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Bonjour {ctx.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Voici un aperçu de votre activité sur OfficeFlex.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Réservations
          </p>
          <p className="mt-2 text-2xl font-semibold">{totalBookings}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Dépenses cumulées
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {formatCents(spend._sum.priceAmountCents ?? 0)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Espaces favoris
          </p>
          <p className="mt-2 text-2xl font-semibold">{favoritesCount}</p>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-foreground">Prochaine réservation</h2>
        {nextBooking ? (
          <Card className="p-5">
            <p className="font-medium">{nextBooking.space.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatDateTime(nextBooking.startsAt)} → {formatDateTime(nextBooking.endsAt)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Statut : {nextBooking.status}
            </p>
          </Card>
        ) : (
          <EmptyState
            title="Aucune réservation pour l'instant"
            description="Recherchez votre premier espace professionnel pour recevoir vos clients dans les meilleures conditions."
            action={
              <ButtonLink href="/search" variant="primary" size="sm">
                Rechercher un espace
              </ButtonLink>
            }
          />
        )}
      </section>

      {/* The discovery path for the single-account model: a tenant who owns a
          space has no reason to know the landlord side exists unless it is
          offered here. Hidden once the activity is open — the mode switcher
          takes over. */}
      {!ctx.isLandlord && (
        <Card className="flex flex-col gap-3 p-5">
          <div>
            <h2 className="text-lg font-medium text-foreground">
              Vous avez un espace à louer ?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ouvrez une activité de bailleur sur ce même compte. Vous pourrez
              basculer entre vos deux modes à tout moment.
            </p>
          </div>
          <ButtonLink href="/app/become-landlord" size="sm" className="self-start">
            Devenir bailleur
          </ButtonLink>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        Besoin d&apos;aide ?{" "}
        <Link href="/" className="underline underline-offset-2">
          Retour à l&apos;accueil
        </Link>
      </p>
    </div>
  );
}
