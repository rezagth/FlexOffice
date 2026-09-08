import { listPublishedSpaces } from "@/server/domains/spaces/list-spaces";
import { getAuthContext } from "@/server/auth/rbac";
import { isDatabaseConfigured } from "@/server/auth/runtime-config";
import { getFavoritedSpaceIds } from "@/server/domains/favorites/favorites";
import { EmptyState } from "@/components/dashboard/states";
import { SpaceCard } from "@/components/marketing/space-card";
import { SiteHeader } from "@/components/marketing/site-header";
import { SearchGeolocation } from "@/components/marketing/search-geolocation";
import { SearchMapLoader } from "@/components/marketing/search-map-loader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SPACE_AMENITY_LABELS } from "@/lib/format";

const AMENITY_VALUES = Object.keys(SPACE_AMENITY_LABELS);

export const metadata = { title: "Rechercher un espace — OfficeFlex" };
// Reflects live listings and query-string filters — must not be cached.
export const dynamic = "force-dynamic";

// Public: browsing published spaces requires no account, per the brief's
// "recherche rapide, sans inscription requise". Booking does require one —
// the space detail page below prompts for it at that point instead.
export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const { city, lat, lng, capacity, amenities, date } = await searchParams;
  const cityFilter = typeof city === "string" ? city : undefined;
  const latNum = typeof lat === "string" ? Number(lat) : undefined;
  const lngNum = typeof lng === "string" ? Number(lng) : undefined;
  const near =
    latNum != null && lngNum != null && Number.isFinite(latNum) && Number.isFinite(lngNum)
      ? { lat: latNum, lng: lngNum }
      : undefined;
  const capacityNum = typeof capacity === "string" ? Number(capacity) : undefined;
  const capacityFilter =
    capacityNum != null && Number.isFinite(capacityNum) && capacityNum > 0
      ? Math.floor(capacityNum)
      : undefined;
  const amenitiesFilter = amenities == null ? [] : Array.isArray(amenities) ? amenities : [amenities];
  const dateFilter =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;

  const [rawSpaces, ctx] = await Promise.all([
    listPublishedSpaces({
      city: cityFilter,
      near,
      capacity: capacityFilter,
      amenities: amenitiesFilter,
      date: dateFilter,
      track: true,
    }),
    getAuthContext(),
  ]);

  // Demo mode has no real Favorite table to query — same reason mock
  // spaces skip capacity/amenities/date above. A signed-out visitor sees
  // no favorite state either (favorited is left `undefined`, which hides
  // the button — see SpaceCard).
  const favoritedIds =
    ctx && isDatabaseConfigured()
      ? await getFavoritedSpaceIds(ctx.userId, rawSpaces.map((s) => s.id))
      : null;
  const spaces = rawSpaces.map((space) => ({
    ...space,
    favorited: favoritedIds ? favoritedIds.has(space.id) : undefined,
  }));

  const mapPoints = spaces
    .filter(
      (
        s
      ): s is typeof s & { property: { latitude: number; longitude: number } } =>
        s.property.latitude != null && s.property.longitude != null
    )
    .map((s) => ({ slug: s.slug, name: s.name, city: s.city, lat: s.property.latitude, lng: s.property.longitude }));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Rechercher un espace</h1>
          <p className="text-sm text-muted-foreground">
            Filtrez par ville, date, capacité et équipements.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <form className="flex flex-wrap items-end gap-4">
            <div className="flex max-w-md flex-1 gap-2">
              <Input
                type="search"
                name="city"
                defaultValue={cityFilter}
                placeholder="Ville (ex. Paris, Lyon…)"
                aria-label="Filtrer par ville"
              />
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Date
              <Input type="date" name="date" defaultValue={dateFilter} aria-label="Filtrer par date" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Capacité minimale
              <Input
                type="number"
                name="capacity"
                min={1}
                defaultValue={capacityFilter}
                placeholder="ex. 10"
                aria-label="Filtrer par capacité minimale"
                className="w-28"
              />
            </label>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-xs text-muted-foreground">Équipements</legend>
              <div className="flex max-w-lg flex-wrap gap-x-3 gap-y-1">
                {AMENITY_VALUES.map((value) => (
                  <label key={value} className="flex items-center gap-1.5 text-xs text-foreground">
                    <input
                      type="checkbox"
                      name="amenities"
                      value={value}
                      defaultChecked={amenitiesFilter.includes(value)}
                    />
                    {SPACE_AMENITY_LABELS[value]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" size="md">
              Rechercher
            </Button>
          </form>
          <SearchGeolocation />
        </div>

        {mapPoints.length > 0 && (
          <SearchMapLoader points={mapPoints} center={[mapPoints[0].lat, mapPoints[0].lng]} />
        )}

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
