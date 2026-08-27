import { listPublishedSpaces } from "@/server/domains/spaces/list-spaces";
import { EmptyState } from "@/components/dashboard/states";
import { SpaceCard } from "@/components/marketing/space-card";
import { SiteHeader } from "@/components/marketing/site-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Rechercher un espace — OfficeFlex" };
// Reflects live listings and query-string filters — must not be cached.
export const dynamic = "force-dynamic";

// Public: browsing published spaces requires no account, per the brief's
// "recherche rapide, sans inscription requise". Booking does require one —
// the space detail page below prompts for it at that point instead.
export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const { city } = await searchParams;
  const cityFilter = typeof city === "string" ? city : undefined;
  const spaces = await listPublishedSpaces({ city: cityFilter });

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Rechercher un espace</h1>
          <p className="text-sm text-muted-foreground">
            Filtre par ville pour l&apos;instant — date, capacité et équipements
            arrivent dans une prochaine itération.
          </p>
        </div>

        <form className="flex max-w-md gap-2">
          <Input
            type="search"
            name="city"
            defaultValue={cityFilter}
            placeholder="Ville (ex. Paris, Lyon…)"
            aria-label="Filtrer par ville"
          />
          <Button type="submit" size="md">
            Rechercher
          </Button>
        </form>

        {spaces.length === 0 ? (
          <EmptyState
            title="Aucun espace trouvé"
            description="Essayez une autre ville, ou revenez plus tard : de nouveaux espaces sont ajoutés régulièrement."
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((space) => (
              <SpaceCard key={space.slug} space={space} href={`/spaces/${space.slug}`} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
