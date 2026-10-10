import type { SpaceAmenity, SpaceType } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { STATUSES_ALLOWED_TO_PUBLISH } from "@/server/domains/organizations/publication-guard";
import { recordSearchEvent } from "@/server/domains/analytics/search-events";
import { getPublicPhotoUrl } from "@/server/domains/media/photo-storage";
import { isSpaceAvailableOnDate } from "@/server/domains/bookings/availability";
import { SPACE_AMENITY_LABELS, SPACE_TYPE_LABELS } from "@/lib/format";
import {
  SEARCH_MAX_PAGE,
  SEARCH_MAX_PAGE_SIZE,
  SEARCH_PAGE_SIZE,
  type SearchSort,
} from "@/lib/validation/search";
import { MOCK_SPACES } from "./mock-data";

type MockSpace = (typeof MOCK_SPACES)[number];
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
    cancellationWindowHours: true,
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

export type PublishedSpaceSearch = {
  city?: string;
  near?: { lat: number; lng: number };
  capacity?: number;
  amenities?: string[];
  date?: string;
  /** A SpaceType value; anything else is ignored. */
  type?: string;
  /** Upper bound on the full-day list price, in cents. */
  maxPriceCents?: number;
  sort?: SearchSort;
  /** 1-based. */
  page?: number;
  limit?: number;
  track?: boolean;
};

export type PublishedSpacesPage<T> = {
  spaces: T[];
  /** Matching spaces across every page. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/**
 * When the date filter or the distance sort is used, matching cannot happen
 * entirely in SQL (availability depends on each space's opening hours,
 * closures and bookings; distance is computed here), so at most this many
 * candidates are read — in the requested order — and filtered/sorted in
 * memory before being paginated. Beyond that the results are truncated; the
 * same trade-off the previous fixed `take: 50` made, with a higher ceiling.
 */
export const IN_MEMORY_CANDIDATE_CAP = 100;

const VALID_SPACE_TYPES = new Set(Object.keys(SPACE_TYPE_LABELS));

function normalizePaging(params: PublishedSpaceSearch) {
  const pageSize = Math.min(
    Math.max(Math.floor(params.limit ?? SEARCH_PAGE_SIZE), 1),
    SEARCH_MAX_PAGE_SIZE
  );
  const page = Math.min(Math.max(Math.floor(params.page ?? 1), 1), SEARCH_MAX_PAGE);
  return { page, pageSize };
}

function pageOf<T>(items: T[], page: number, pageSize: number): PublishedSpacesPage<T> {
  return {
    spaces: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(items.length / pageSize)),
  };
}

function compareDistance(a: { distanceKm: number | null }, b: { distanceKm: number | null }) {
  if (a.distanceKm == null && b.distanceKm == null) return 0;
  if (a.distanceKm == null) return 1;
  if (b.distanceKm == null) return -1;
  return a.distanceKm - b.distanceKm;
}

/**
 * Public space search — city substring match, capacity floor, amenities
 * (must have every one requested), space type, maximum full-day price,
 * same-day availability, an optional distance sort when the caller supplies
 * its own coordinates (browser geolocation, see search-geolocation.tsx), a
 * sort order and pagination. No auth required: browsing published listings
 * is public.
 *
 * Sort: `relevance` is "closest first" when a position is given, "most recent
 * first" otherwise; `price_asc` / `price_desc` order by the full-day list
 * price (before any discount). Ties are broken by id so pages never overlap.
 *
 * A space whose property has no coordinates yet (geocoding failed, or it
 * predates geocodeAddress()) is kept, just not distance-sorted — it is
 * appended after every space that does have one, rather than dropped.
 *
 * `capacity`, `amenities`, `type` and `maxPriceCents` are applied in the
 * database query and paginated there (`count` + `skip`/`take`). `date` and
 * the distance sort are not — see IN_MEMORY_CANDIDATE_CAP.
 *
 * Demo mode (no database) applies the same filters, sort and pagination to
 * the static mock listings — except `date` and the amenities, which mock data
 * cannot answer (no bookings, free-text amenity labels).
 *
 * `track: true` records a `SearchEvent` (see analytics/search-events.ts),
 * used only for the recherche → réservation conversion KPI. Passed only by
 * the actual search surfaces (`/search`, `GET /api/spaces`) — the landing
 * page calls this same function for its "espaces à la une" preview, which
 * is not a visitor searching and must not inflate the denominator. The
 * recorded count is the total across pages, not the size of one page.
 */
export async function searchPublishedSpaces(params: PublishedSpaceSearch = {}) {
  const { page, pageSize } = normalizePaging(params);
  const sort: SearchSort = params.sort ?? "relevance";
  const type = params.type && VALID_SPACE_TYPES.has(params.type) ? params.type : undefined;
  const maxPriceCents =
    params.maxPriceCents != null && params.maxPriceCents > 0 ? params.maxPriceCents : undefined;

  if (servesNothing) return pageOf<MockSpace & { distanceKm: number | null }>([], page, pageSize);
  if (useMockData) {
    const city = params.city?.toLowerCase();
    const matches = MOCK_SPACES.filter(
      (space) =>
        (!city || space.city.toLowerCase().includes(city)) &&
        (!params.capacity || space.capacity >= params.capacity) &&
        (!type || space.type === type) &&
        (!maxPriceCents || space.dayPriceCents <= maxPriceCents)
    ).map((space) => ({ ...space, distanceKm: null as number | null }));
    if (sort === "price_asc") matches.sort((a, b) => a.dayPriceCents - b.dayPriceCents);
    if (sort === "price_desc") matches.sort((a, b) => b.dayPriceCents - a.dayPriceCents);
    return pageOf(matches, page, pageSize);
  }

  const amenityFilter = sanitizeAmenities(params.amenities);
  const where = {
    status: "PUBLISHED" as const,
    organization: publiclyVisibleOrganization(),
    ...(params.city ? { city: { contains: params.city, mode: "insensitive" as const } } : {}),
    ...(params.capacity ? { capacity: { gte: params.capacity } } : {}),
    ...(amenityFilter.length ? { amenities: { hasEvery: amenityFilter } } : {}),
    ...(type ? { type: type as SpaceType } : {}),
    ...(maxPriceCents ? { dayPriceCents: { lte: maxPriceCents } } : {}),
  };
  const orderBy =
    sort === "price_asc"
      ? [{ dayPriceCents: "asc" as const }, { id: "asc" as const }]
      : sort === "price_desc"
        ? [{ dayPriceCents: "desc" as const }, { id: "asc" as const }]
        : [{ createdAt: "desc" as const }, { id: "asc" as const }];
  const select = {
    ...publicSpaceScalars(),
    organization: { select: { name: true, status: true } },
    property: { select: { latitude: true, longitude: true } },
    spacePhotos: spacePhotosInclude(),
  };

  const toPublic = (rawSpaces: Awaited<ReturnType<typeof findSpaces>>) =>
    rawSpaces.map(({ spacePhotos, ...space }) => ({
      ...space,
      photos: resolvePhotoUrls(space.photos, spacePhotos),
      distanceKm: null as number | null,
    }));
  function findSpaces(skip: number, take: number) {
    return prisma.space.findMany({ where, select, orderBy, skip, take });
  }

  let result: PublishedSpacesPage<ReturnType<typeof toPublic>[number]>;

  if (!params.date && !params.near) {
    const [total, rawSpaces] = await Promise.all([
      prisma.space.count({ where }),
      findSpaces((page - 1) * pageSize, pageSize),
    ]);
    result = {
      spaces: toPublic(rawSpaces),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  } else {
    let spaces = toPublic(await findSpaces(0, IN_MEMORY_CANDIDATE_CAP));

    if (params.date) {
      const availableFlags = await Promise.all(
        spaces.map((space) => isSpaceAvailableOnDate(space.id, params.date!))
      );
      spaces = spaces.filter((_, i) => availableFlags[i]);
    }

    if (params.near) {
      const near = params.near;
      spaces = spaces.map((space) => ({
        ...space,
        distanceKm:
          space.property.latitude != null && space.property.longitude != null
            ? distanceKm(near, { lat: space.property.latitude, lng: space.property.longitude })
            : null,
      }));
      // A price sort keeps its order; distance only decides "relevance".
      if (sort === "relevance") spaces.sort(compareDistance);
    }

    result = pageOf(spaces, page, pageSize);
  }

  if (params.track) {
    await recordSearchEvent({
      city: params.city,
      hasGeo: Boolean(params.near),
      resultsCount: result.total,
    });
  }

  return result;
}

/** One page of matching spaces, without the pagination metadata — for
 * callers that only need a short list (the landing page's featured spaces). */
export async function listPublishedSpaces(params: PublishedSpaceSearch = {}) {
  return (await searchPublishedSpaces(params)).spaces;
}

/**
 * Every published slug, for sitemap.xml. Same visibility rule as the public
 * reads; selects nothing but the slug and the last modification date.
 */
export async function listPublishedSpaceSlugs(): Promise<{ slug: string; updatedAt?: Date }[]> {
  if (servesNothing) return [];
  if (useMockData) return MOCK_SPACES.map((space) => ({ slug: space.slug }));
  return prisma.space.findMany({
    where: { status: "PUBLISHED", organization: publiclyVisibleOrganization() },
    select: { slug: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
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
