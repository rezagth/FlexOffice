import { z } from "zod";
import { SPACE_AMENITY_LABELS, SPACE_TYPE_LABELS } from "@/lib/format";

/**
 * Public space search parameters (UX-15 / UX-25 / FCT-23), shared by the
 * `/search` page and `GET /api/spaces` so both read the query string the same
 * way.
 *
 * Lenient on purpose: this is a public URL that people edit, share and
 * bookmark. A malformed value is dropped (or falls back to its default), never
 * turned into a 400 or an error page — the visitor still gets results. Every
 * value is still bounded here, before it reaches a database query.
 */
export const SEARCH_PAGE_SIZE = 24;
export const SEARCH_MAX_PAGE_SIZE = 50;
/** Deep pages are not useful for a marketplace this size, and an unbounded
 * `skip` is an easy way to make the database work for nothing. */
export const SEARCH_MAX_PAGE = 200;

export const SEARCH_SORTS = ["relevance", "price_asc", "price_desc"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export const SEARCH_SORT_LABELS: Record<SearchSort, string> = {
  // Most recent first — or closest first when the visitor shared a position.
  relevance: "Pertinence",
  price_asc: "Prix croissant",
  price_desc: "Prix décroissant",
};

const SPACE_TYPES = Object.keys(SPACE_TYPE_LABELS);
const AMENITIES = new Set(Object.keys(SPACE_AMENITY_LABELS));

export type SpaceSearchParams = {
  city?: string;
  near?: { lat: number; lng: number };
  capacity?: number;
  amenities: string[];
  date?: string;
  type?: string;
  /** Upper bound on the full-day list price, in cents. */
  maxPriceCents?: number;
  sort: SearchSort;
  page: number;
  limit: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function all(value: string | string[] | undefined): string[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

const optionalInt = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).optional().catch(undefined);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  });

const schema = z.object({
  city: z
    .string()
    .trim()
    .max(100)
    .transform((value) => value || undefined)
    .optional()
    .catch(undefined),
  lat: z.coerce.number().min(-90).max(90).optional().catch(undefined),
  lng: z.coerce.number().min(-180).max(180).optional().catch(undefined),
  capacity: optionalInt(1, 1000),
  date: isoDate.optional().catch(undefined),
  type: z
    .string()
    .refine((value) => SPACE_TYPES.includes(value))
    .optional()
    .catch(undefined),
  // Entered in euros in the form; converted to cents below.
  maxPrice: optionalInt(1, 100_000),
  sort: z.enum(SEARCH_SORTS).catch("relevance"),
  page: z.coerce.number().int().min(1).max(SEARCH_MAX_PAGE).catch(1),
  limit: z.coerce.number().int().min(1).max(SEARCH_MAX_PAGE_SIZE).catch(SEARCH_PAGE_SIZE),
});

/** Turns a URLSearchParams into the record shape Next.js page props use. */
export function searchParamsToRecord(params: URLSearchParams): RawParams {
  const record: RawParams = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    record[key] = values.length > 1 ? values : values[0];
  }
  return record;
}

export function parseSpaceSearchParams(raw: RawParams): SpaceSearchParams {
  // `?? undefined` everywhere: an absent key must hit the schema's default.
  const parsed = schema.parse({
    city: first(raw.city) ?? undefined,
    lat: first(raw.lat) || undefined,
    lng: first(raw.lng) || undefined,
    capacity: first(raw.capacity) || undefined,
    date: first(raw.date) || undefined,
    type: first(raw.type) || undefined,
    maxPrice: first(raw.maxPrice) || undefined,
    sort: first(raw.sort) ?? "relevance",
    page: first(raw.page) ?? 1,
    limit: first(raw.limit) ?? SEARCH_PAGE_SIZE,
  });

  return {
    city: parsed.city,
    near:
      parsed.lat != null && parsed.lng != null ? { lat: parsed.lat, lng: parsed.lng } : undefined,
    capacity: parsed.capacity,
    // Unknown values are dropped: the amenity filter is a Postgres enum-array
    // comparison, where an unrecognized value would throw instead of matching
    // nothing. Deduplicated and bounded by the enum itself.
    amenities: [...new Set(all(raw.amenities).filter((value) => AMENITIES.has(value)))],
    date: parsed.date,
    type: parsed.type,
    maxPriceCents: parsed.maxPrice != null ? parsed.maxPrice * 100 : undefined,
    sort: parsed.sort,
    page: parsed.page,
    limit: parsed.limit,
  };
}

/**
 * Query string for another page of the same search — every filter kept,
 * only `page` changed (page 1 is left implicit).
 */
export function searchPageHref(raw: RawParams, page: number, pathname = "/search"): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (key === "page") continue;
    for (const item of all(value)) params.append(key, item);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
