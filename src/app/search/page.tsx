import type { Metadata } from "next";
import { searchPublishedSpaces } from "@/server/domains/spaces/list-spaces";
import { getAuthContext } from "@/server/auth/rbac";
import { isDatabaseConfigured } from "@/server/auth/runtime-config";
import { getFavoritedSpaceIds } from "@/server/domains/favorites/favorites";
import { EmptyState } from "@/components/dashboard/states";
import { SearchResultsGrid } from "@/components/marketing/search-results-grid";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SearchGeolocation } from "@/components/marketing/search-geolocation";
import { SearchMapLoader } from "@/components/marketing/search-map-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { SPACE_AMENITY_LABELS, SPACE_TYPE_LABELS } from "@/lib/format";
import {
  parseSpaceSearchParams,
  SEARCH_SORT_LABELS,
  SEARCH_SORTS,
  searchPageHref,
} from "@/lib/validation/search";
import { pageMetadata } from "@/lib/site";

const AMENITY_VALUES = Object.keys(SPACE_AMENITY_LABELS).filter((value) => value !== "OTHER");

export const metadata: Metadata = pageMetadata({
  title: "Rechercher un espace — OfficeFlex",
  description:
    "Trouvez une salle de réunion, un bureau ou un espace de formation à réserver à la demi-journée ou à la journée, par ville, date, capacité et équipements.",
  path: "/search",
});
// Reflects live listings and query-string filters — must not be cached.
export const dynamic = "force-dynamic";

function resultsLabel(total: number): string {
  if (total === 0) return "Aucun espace trouvé";
  return total === 1 ? "1 espace trouvé" : `${total} espaces trouvés`;
}

// Public: browsing published spaces requires no account ("recherche rapide,
// sans inscription requise"). Booking does — the space page asks for it.
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const raw = await searchParams;
  const search = parseSpaceSearchParams(raw);

  const [result, ctx] = await Promise.all([
    searchPublishedSpaces({ ...search, track: true }),
    getAuthContext(),
  ]);

  // Demo mode has no Favorite table to query. A signed-out visitor sees no
  // favorite state either (`favorited` left undefined hides the button).
  const favoritedIds =
    ctx && isDatabaseConfigured()
      ? await getFavoritedSpaceIds(ctx.userId, result.spaces.map((s) => s.id))
      : null;
  const spaces = result.spaces.map((space) => ({
    ...space,
    favorited: favoritedIds ? favoritedIds.has(space.id) : undefined,
  }));

  const mapPoints = spaces
    .filter(
      (s): s is typeof s & { property: { latitude: number; longitude: number } } =>
        s.property.latitude != null && s.property.longitude != null
    )
    .map((s) => ({
      slug: s.slug,
      name: s.name,
      city: s.city,
      lat: s.property.latitude,
      lng: s.property.longitude,
    }));

  // The chosen date travels to the space page, then to its booking link
  // (UX-16), so the visitor does not pick it twice.
  const spaceHrefSuffix = search.date ? `?date=${search.date}` : "";
  const hasFilters = Boolean(
    search.city ||
      search.date ||
      search.capacity ||
      search.type ||
      search.maxPriceCents ||
      search.amenities.length
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="contenu" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Rechercher un espace</h1>
          <p className="text-sm text-muted-foreground">
            Filtrez par ville, date, capacité, type, budget et équipements.
          </p>
        </div>

        <form
          role="search"
          aria-label="Filtres de recherche"
          className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="search-city">Ville</Label>
              <Input
                id="search-city"
                type="search"
                name="city"
                autoComplete="address-level2"
                defaultValue={search.city}
                placeholder="Ex. Paris, Lyon…"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="search-date">Date</Label>
              <Input id="search-date" type="date" name="date" defaultValue={search.date} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="search-capacity">Capacité minimale</Label>
              <Input
                id="search-capacity"
                type="number"
                name="capacity"
                min={1}
                inputMode="numeric"
                defaultValue={search.capacity}
                placeholder="Ex. 10"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="search-type">Type d&apos;espace</Label>
              <Select id="search-type" name="type" defaultValue={search.type ?? ""}>
                <option value="">Tous les types</option>
                {Object.entries(SPACE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="search-max-price">Prix max. / jour (€)</Label>
              <Input
                id="search-max-price"
                type="number"
                name="maxPrice"
                min={1}
                step={1}
                inputMode="numeric"
                defaultValue={search.maxPriceCents ? search.maxPriceCents / 100 : undefined}
                placeholder="Ex. 300"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="search-sort">Trier par</Label>
              <Select id="search-sort" name="sort" defaultValue={search.sort}>
                {SEARCH_SORTS.map((sort) => (
                  <option key={sort} value={sort}>
                    {SEARCH_SORT_LABELS[sort]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-foreground">Équipements</legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
              {AMENITY_VALUES.map((value) => (
                <div key={value} className="flex items-center gap-2">
                  <Checkbox
                    id={`amenity-${value}`}
                    name="amenities"
                    value={value}
                    defaultChecked={search.amenities.includes(value)}
                  />
                  <Label htmlFor={`amenity-${value}`} className="font-normal">
                    {SPACE_AMENITY_LABELS[value]}
                  </Label>
                </div>
              ))}
            </div>
          </fieldset>

          {/* Keeps the "around me" position when the filters change. */}
          {search.near && (
            <>
              <input type="hidden" name="lat" value={search.near.lat} />
              <input type="hidden" name="lng" value={search.near.lng} />
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <SearchGeolocation />
            <div className="flex gap-2">
              {hasFilters && (
                <ButtonLink href="/search" variant="ghost" size="md">
                  Effacer les filtres
                </ButtonLink>
              )}
              <Button type="submit" size="md">
                Rechercher
              </Button>
            </div>
          </div>
        </form>

        <section aria-labelledby="results-heading" className="flex flex-col gap-4">
          <h2
            id="results-heading"
            className="font-sans text-base font-medium text-foreground"
          >
            {resultsLabel(result.total)}
            {result.pageCount > 1 && (
              <span className="font-normal text-muted-foreground">
                {" "}
                · page {result.page} sur {result.pageCount}
              </span>
            )}
          </h2>

          {mapPoints.length > 0 && (
            <SearchMapLoader points={mapPoints} center={[mapPoints[0].lat, mapPoints[0].lng]} />
          )}

          {spaces.length === 0 ? (
            <EmptyState
              title="Aucun espace trouvé"
              description={
                result.total > 0
                  ? "Cette page de résultats est vide : revenez à la première page."
                  : "Essayez une autre ville ou retirez un filtre : de nouveaux espaces sont ajoutés régulièrement."
              }
              action={
                hasFilters || result.total > 0 ? (
                  <ButtonLink href={result.total > 0 ? searchPageHref(raw, 1) : "/search"} variant="outline">
                    {result.total > 0 ? "Première page" : "Effacer les filtres"}
                  </ButtonLink>
                ) : undefined
              }
            />
          ) : (
            <SearchResultsGrid
              spaces={spaces}
              eagerImages={3}
              hrefSuffix={spaceHrefSuffix}
            />
          )}

          {result.pageCount > 1 && (
            <Pagination aria-label="Pages de résultats" className="justify-between pt-2">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={searchPageHref(raw, result.page - 1)}
                    disabled={result.page <= 1}
                  />
                </PaginationItem>
              </PaginationContent>
              <p className="text-sm text-muted-foreground">
                Page {result.page} sur {result.pageCount}
              </p>
              <PaginationContent>
                <PaginationItem>
                  <PaginationNext
                    href={searchPageHref(raw, result.page + 1)}
                    disabled={result.page >= result.pageCount}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
