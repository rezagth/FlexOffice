import type { SpaceAmenity } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { STATUSES_ALLOWED_TO_PUBLISH } from "@/server/domains/organizations/publication-guard";
import { recordSearchEvent } from "@/server/domains/analytics/search-events";
import { getPublicPhotoUrl } from "@/server/domains/media/photo-storage";
import { isSpaceAvailableOnDate } from "@/server/domains/bookings/availability";
import { SPACE_AMENITY_LABELS } from "@/lib/format";
import { MOCK_SPACES } from "./mock-data";
import { isProductionDeployment } from "@/server/auth/runtime-config";

const VALID_AMENITIES = new Set(Object.keys(SPACE_AMENITY_LABELS));

/** Drops anything that isn't a known SpaceAmenity — `amenities` reaches
 * here straight from a public query string (GET /api/spaces, /search), and
 * `amenities: { hasEvery: [...] }` is a Postgres enum-array filter: an
 * unrecognized value would throw, not just match nothing. */
function sanitizeAmenities(amenities: string[] | undefined): SpaceAmenity[] {
  if (!amenities?.length) return [];
  return amenities.filter((a): a is SpaceAmenity => VALID_AMENITIES.has(a));
}

/** Ordered exactly like the partner-side photo manager: primary photo
 * first, then upload order. `Space.photos` (the deprecated string[] column,
 * see schema.prisma) is used only as a fallback for a space that predates
 * SpacePhoto uploads — nothing writes to it any more, so real listings
 * converge on SpacePhoto once a partner uploads at least one photo.
 *
 * Rebuilt per call, same reason as publiclyVisibleOrganization() above:
 * `as const`/a shared literal would make the `orderBy` array readonly,
 * which Prisma's generated args type — mutable — rejects. */
function spacePhotosInclude() {
  return {
    orderBy: [{ isPrimary: "desc" as const }, { position: "asc" as const }],
    select: { storagePath: true },
  };
}

function resolvePhotoUrls(legacyPhotos: string[], spacePhotos: { storagePath: string }[]): string[] {
  if (spacePhotos.length === 0) return legacyPhotos;
  return spacePhotos.map((photo) => getPublicPhotoUrl(photo.storagePath));
}

/**
 * The ONLY columns of a `Space` that may leave the server on a public read.
 *
 * Public reads used to `include` relations, which returns every scalar
 * column of the row — including `accessInstructions` (door codes, key-box
 * codes), which is meant to be shown only to a client with a CONFIRMED
 * booking. These rows are serialized as-is into `GET /api/spaces` and into
 * the RSC payload of `/` and `/search` (the result grid is a Client
 * Component), so an anonymous visitor could read every listing's access
 * codes without booking anything.
 *
 * An explicit allow-list rather than an omit: a column added to `Space`
 * later stays private until someone decides it is public. Never add
 * `accessInstructions`, `organizationId` or `propertyId` here — see
 * tests/unit/list-spaces-public-fields.test.ts.
 */
function publicSpaceScalars() {
  return {
    id: true,
    slug: true,
    name: true,
    type: true,
    description: true,
    address: true,
    city: true,
    postalCode: true,
    capacity: true,
    amenities: true,
    photos: true,
    halfDayPriceCents: true,
    dayPriceCents: true,
    discountPercent: true,
    timezone: true,
    status: true,
  } as const;
}

// No DATABASE_URL configured yet (e.g. a demo deploy without Supabase
// wired up): fall back to static demo data instead of erroring, so the
// public pages stay browsable. Once DATABASE_URL is set this branch never
// runs — see mock-data.ts.
//
// Except in a real production deployment (NODE_ENV=production without
// OFFICEFLEX_DEMO_MODE=true): there, a missing DATABASE_URL is a
// configuration mistake, and serving made-up listings to real visitors
// would be worse than an empty catalogue. Pages still render (no outage),
// with no results; runtime-config.ts already logs the misconfiguration.
const noDatabase = !process.env.DATABASE_URL;
const useMockData = noDatabase && !isProductionDeployment();
const servesNothing = noDatabase && isProductionDeployment();

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
 * `capacity` (>=) and `amenities` (must have every one requested) are
 * applied in the database query. `date` is not: availability depends on
 * each space's own opening hours/closures/bookings, so it is checked
 * per-candidate via isSpaceAvailableOnDate() after the DB filter narrows
 * the list — same N-calls-for-N-spaces tradeoff summarizeMonth() already
 * accepts for a page-sized (`take: 50`) result set, not a hot inner loop.
 *
 * None of the three run against the demo mock data — same as `near`
 * above, mock mode only ever supported the city filter.
 *
 * `track: true` records a `SearchEvent` (see analytics/search-events.ts),
 * used only for the recherche → réservation conversion KPI. Passed only by
 * the actual search surfaces (`/search`, `GET /api/spaces`) — the landing
 * page calls this same function for its "espaces à la une" preview, which
 * is not a visitor searching and must not inflate the denominator.
 */
export async function listPublishedSpaces(
  params: {
    city?: string;
    near?: { lat: number; lng: number };
    capacity?: number;
    amenities?: string[];
    date?: string;
    track?: boolean;
  } = {}
) {
  if (servesNothing) return [];
  if (useMockData) {
    const city = params.city?.toLowerCase();
    return MOCK_SPACES.filter(
      (space) => !city || space.city.toLowerCase().includes(city)
    );
  }

  const amenityFilter = sanitizeAmenities(params.amenities);

  const rawSpaces = await prisma.space.findMany({
    where: {
      status: "PUBLISHED",
      organization: publiclyVisibleOrganization(),
      ...(params.city
        ? { city: { contains: params.city, mode: "insensitive" } }
        : {}),
      ...(params.capacity ? { capacity: { gte: params.capacity } } : {}),
      ...(amenityFilter.length ? { amenities: { hasEvery: amenityFilter } } : {}),
    },
    select: {
      ...publicSpaceScalars(),
      organization: { select: { name: true, status: true } },
      property: { select: { latitude: true, longitude: true } },
      spacePhotos: spacePhotosInclude(),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  let spaces = rawSpaces.map(({ spacePhotos, ...space }) => ({
    ...space,
    photos: resolvePhotoUrls(space.photos, spacePhotos),
  }));

  if (params.date) {
    const availableFlags = await Promise.all(
      spaces.map((space) => isSpaceAvailableOnDate(space.id, params.date!))
    );
    spaces = spaces.filter((_, i) => availableFlags[i]);
  }

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
  if (servesNothing) return null;
  if (useMockData) {
    return MOCK_SPACES.find((space) => space.slug === slug) ?? null;
  }

  const space = await prisma.space.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      organization: publiclyVisibleOrganization(),
    },
    select: {
      ...publicSpaceScalars(),
      organization: { select: { name: true, status: true } },
      openingHours: { select: { weekday: true, opensAt: true, closesAt: true } },
      spacePhotos: spacePhotosInclude(),
    },
  });
  if (!space) return null;

  const { spacePhotos, ...rest } = space;
  return { ...rest, photos: resolvePhotoUrls(space.photos, spacePhotos) };
}

/**
 * The signed-in visitor's favorites, as public space cards.
 *
 * Same allow-list as the public reads above: the result is handed to
 * SearchResultsGrid, a Client Component, so the whole object is serialized
 * to the browser. Favoriting a space is open to any account, so returning
 * the full row here would leak `accessInstructions` to anyone who clicks
 * the heart. Listings that were unpublished or whose organization was
 * suspended since being favorited are dropped, like on /search.
 */
export async function listFavoriteSpaces(userId: string) {
  const favorites = await prisma.favorite.findMany({
    where: {
      userId,
      space: { status: "PUBLISHED", organization: publiclyVisibleOrganization() },
    },
    select: {
      space: {
        select: {
          ...publicSpaceScalars(),
          organization: { select: { name: true, status: true } },
          spacePhotos: spacePhotosInclude(),
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return favorites.map(({ space: { spacePhotos, ...space } }) => ({
    ...space,
    photos: resolvePhotoUrls(space.photos, spacePhotos),
    favorited: true as const,
  }));
}
