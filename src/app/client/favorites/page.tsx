import { requirePageRole } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { EmptyState } from "@/components/dashboard/states";
import { SpaceCard } from "@/components/marketing/space-card";
import { ButtonLink } from "@/components/ui/button";

export default async function ClientFavoritesPage() {
  const ctx = await requirePageRole("CLIENT");
  const favorites = await prisma.favorite.findMany({
    where: { userId: ctx.userId },
    include: { space: { include: { organization: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Espaces favoris</h1>

      {favorites.length === 0 ? (
        <EmptyState
          title="Aucun favori pour l'instant"
          description="Ajoutez des espaces à vos favoris pendant votre recherche pour les retrouver ici."
          action={
            <ButtonLink href="/search" size="sm">
              Rechercher un espace
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {favorites.map(({ space }) => (
            <SpaceCard key={space.slug} space={space} href={`/spaces/${space.slug}`} />
          ))}
        </div>
      )}
    </div>
  );
}
