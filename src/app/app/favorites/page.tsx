import { requirePageAuth } from "@/server/auth/page-guards";
import { prisma } from "@/server/db/prisma";
import { EmptyState } from "@/components/dashboard/states";
import { SearchResultsGrid } from "@/components/marketing/search-results-grid";
import { ButtonLink } from "@/components/ui/button";

export default async function ClientFavoritesPage() {
  const ctx = await requirePageAuth();
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
        <SearchResultsGrid spaces={favorites.map(({ space }) => ({ ...space, favorited: true }))} />
      )}
    </div>
  );
}
