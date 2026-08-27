import Link from "next/link";
import { getAuthContext } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/states";

export default async function ClientDashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) return null; // layout already redirects unauthenticated users; this guards the brief render race before that redirect completes

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

  const spendEuros = ((spend._sum.priceAmountCents ?? 0) / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });

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
          <p className="mt-2 text-2xl font-semibold">{spendEuros}</p>
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
              {nextBooking.startsAt.toLocaleString("fr-FR")} —{" "}
              {nextBooking.endsAt.toLocaleString("fr-FR")}
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

      <p className="text-sm text-muted-foreground">
        Besoin d&apos;aide ?{" "}
        <Link href="/" className="underline underline-offset-2">
          Retour à l&apos;accueil
        </Link>
      </p>
    </div>
  );
}
