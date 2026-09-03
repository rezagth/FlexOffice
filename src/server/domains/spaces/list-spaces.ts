import { prisma } from "@/server/db/prisma";
import { STATUSES_ALLOWED_TO_PUBLISH } from "@/server/domains/organizations/publication-guard";
import { recordSearchEvent } from "@/server/domains/analytics/search-events";
import { MOCK_SPACES } from "./mock-data";

// No DATABASE_URL configured yet (e.g. a demo deploy without Supabase
// wired up): fall back to static demo data instead of erroring, so the
// public pages stay browsable. Once DATABASE_URL is set this branch never
// runs — see mock-data.ts.
const useMockData = !process.env.DATABASE_URL;

/**
 * The organization side of "is this listing publicly visible".
 *
 * A space being PUBLISHED was the only condition, so suspending an
 * organization left its listings live, bookable and payable. Now that the
 * booking tunnel works end to end, that is not a cosmetic gap: a suspended
 * partner could still take money.
 *
 * Kept in one place so every public read applies the same rule — a new query
 * that forgets it reopens the hole. See publication-guard.ts for why the
 * threshold is what it is today.
 */
function publiclyVisibleOrganization() {
  // Rebuilt per call, and the readonly policy list copied into a mutable
  // array: Prisma's generated `in` filter type is mutable, and a shared
  // object literal would be reused across concurrent queries.
  return { status: { in: [...STATUSES_ALLOWED_TO_PUBLISH] } };
}

/** Great-circle distance in kilometres — Haversine. Fine at this dataset's
 * scale (a search result page, not a spatial index); PostGIS would be the
 * right call well before this stops being fast enough. */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Public space search — city substring match, plus an optional distance
 * sort when the caller supplies its own coordinates (browser geolocation,
 * see search-geolocation.tsx). No auth required: browsing published
 * listings is public, same as the rest of the marketplace's "Découvrir"
 * experience. Date/capacity/amenities filters are noted as future work, not
 * silently ignored — the search page below says so.
 *
 * A space whose property has no coordinates yet (geocoding failed, or it
 * predates geocodeAddress()) is kept, just not distance-sorted — it is
 * appended after every space that does have one, rather than dropped from
 * the results.
 *
 * `track: true` records a `SearchEvent` (see analytics/search-events.ts),
 * used only for the recherche → réservation conversion KPI. Passed only by
 * the actual search surfaces (`/search`, `GET /api/spaces`) — the landing
 * page calls this same function for its "espaces à la une" preview, which
 * is not a visitor searching and must not inflate the denominator.
 */
export async function listPublishedSpaces(
  params: { city?: string; near?: { lat: number; lng: number }; track?: boolean } = {}
) {
  if (useMockData) {
    const city = params.city?.toLowerCase();
    return MOCK_SPACES.filter(
      (space) => !city || space.city.toLowerCase().includes(city)
    );
  }

  const spaces = await prisma.space.findMany({
    where: {
      status: "PUBLISHED",
      organization: publiclyVisibleOrganization(),
      ...(params.city
        ? { city: { contains: params.city, mode: "insensitive" } }
        : {}),
    },
    include: {
      organization: { select: { name: true } },
      property: { select: { latitude: true, longitude: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (!params.near) {
    if (params.track) {
      await recordSearchEvent({ city: params.city, hasGeo: false, resultsCount: spaces.length });
    }
    return spaces;
  }

  const withDistance = spaces.map((space) => ({
    ...space,
    distanceKm:
      space.property.latitude != null && space.property.longitude != null
        ? distanceKm(
            { lat: params.near!.lat, lng: params.near!.lng },
            { lat: space.property.latitude, lng: space.property.longitude }
          )
        : null,
  }));

  withDistance.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  if (params.track) {
    await recordSearchEvent({ city: params.city, hasGeo: true, resultsCount: withDistance.length });
  }

  return withDistance;
}

export async function getPublishedSpaceBySlug(slug: string) {
  if (useMockData) {
    return MOCK_SPACES.find((space) => space.slug === slug) ?? null;
  }

  return prisma.space.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      organization: publiclyVisibleOrganization(),
    },
    include: {
      organization: { select: { name: true } },
      openingHours: true,
    },
  });
}
