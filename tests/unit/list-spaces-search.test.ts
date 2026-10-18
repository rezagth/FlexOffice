import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Search filters, sort and pagination of the public listing (UX-15/UX-25/
 * FCT-23). An in-memory stand-in evaluates the `where`, `orderBy`, `skip` and
 * `take` that list-spaces.ts builds, so these tests prove the right rows come
 * back in the right order — not merely that some object was passed.
 */

type Row = {
  id: string;
  slug: string;
  type: string;
  city: string;
  capacity: number;
  amenities: string[];
  dayPriceCents: number;
  createdAt: number;
  photos: string[];
  spacePhotos: { storagePath: string }[];
  organization: { name: string; status: string };
  property: { latitude: number | null; longitude: number | null };
};

function row(i: number, overrides: Partial<Row> = {}): Row {
  return {
    id: `id-${String(i).padStart(3, "0")}`,
    slug: `space-${i}`,
    type: "MEETING_ROOM",
    city: "Paris",
    capacity: 10,
    amenities: [],
    dayPriceCents: 10_000 + i * 100,
    createdAt: i,
    photos: [],
    spacePhotos: [],
    organization: { name: "Org", status: "VERIFIED" },
    property: { latitude: null, longitude: null },
    ...overrides,
  };
}

let rows: Row[] = [];

type Args = {
  where: Record<string, unknown>;
  orderBy?: Record<string, "asc" | "desc">[];
  skip?: number;
  take?: number;
};

function matches(space: Row, where: Record<string, unknown>) {
  const type = where.type as string | undefined;
  if (type && space.type !== type) return false;
  const price = where.dayPriceCents as { lte: number } | undefined;
  if (price && space.dayPriceCents > price.lte) return false;
  const capacity = where.capacity as { gte: number } | undefined;
  if (capacity && space.capacity < capacity.gte) return false;
  return true;
}

function ordered(list: Row[], orderBy: Args["orderBy"] = []) {
  return [...list].sort((a, b) => {
    for (const clause of orderBy) {
      const [key, direction] = Object.entries(clause)[0] as [keyof Row, "asc" | "desc"];
      const av = a[key] as number | string;
      const bv = b[key] as number | string;
      if (av === bv) continue;
      const cmp = av < bv ? -1 : 1;
      return direction === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

const spaceFindMany = vi.fn(async ({ where, orderBy, skip = 0, take }: Args) => {
  const list = ordered(rows.filter((space) => matches(space, where)), orderBy);
  return list.slice(skip, take == null ? undefined : skip + take);
});
const spaceCount = vi.fn(async ({ where }: Args) => rows.filter((s) => matches(s, where)).length);
const isSpaceAvailableOnDate = vi.fn<(id: string, date: string) => Promise<boolean>>(async () => true);
const recordSearchEvent = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: { space: { findMany: spaceFindMany, count: spaceCount, findFirst: vi.fn() } },
}));
vi.mock("@/server/domains/media/photo-storage", () => ({
  getPublicPhotoUrl: (path: string) => `https://cdn.test/${path}`,
}));
vi.mock("@/server/domains/analytics/search-events", () => ({ recordSearchEvent }));
vi.mock("@/server/domains/bookings/availability", () => ({ isSpaceAvailableOnDate }));

process.env.DATABASE_URL = "postgresql://test/test";

const { searchPublishedSpaces, IN_MEMORY_CANDIDATE_CAP } = await import(
  "@/server/domains/spaces/list-spaces"
);

beforeEach(() => {
  rows = Array.from({ length: 30 }, (_, i) => row(i + 1));
  spaceFindMany.mockClear();
  spaceCount.mockClear();
  recordSearchEvent.mockClear();
  isSpaceAvailableOnDate.mockReset().mockResolvedValue(true);
});

describe("searchPublishedSpaces — pagination", () => {
  it("returns 24 spaces per page by default, with the total across pages", async () => {
    const first = await searchPublishedSpaces({});
    expect(first.spaces).toHaveLength(24);
    expect(first).toMatchObject({ total: 30, page: 1, pageSize: 24, pageCount: 2 });

    const second = await searchPublishedSpaces({ page: 2 });
    expect(second.spaces).toHaveLength(6);
    const firstIds = new Set(first.spaces.map((s) => s.id));
    expect(second.spaces.some((s) => firstIds.has(s.id))).toBe(false);
  });

  it("paginates in the database: skip/take, never the whole table", async () => {
    await searchPublishedSpaces({ page: 2, limit: 10 });
    const args = spaceFindMany.mock.calls[0][0] as Args;
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
  });

  it("clamps the page size and page number", async () => {
    const result = await searchPublishedSpaces({ limit: 10_000, page: -3 });
    expect(result.pageSize).toBe(50);
    expect(result.page).toBe(1);
  });

  it("records the total, not the page size, in the search event", async () => {
    await searchPublishedSpaces({ track: true, limit: 5 });
    expect(recordSearchEvent).toHaveBeenCalledWith(expect.objectContaining({ resultsCount: 30 }));
  });
});

describe("searchPublishedSpaces — sort and filters", () => {
  it("sorts by full-day price, ascending and descending", async () => {
    const asc = await searchPublishedSpaces({ sort: "price_asc", limit: 3 });
    expect(asc.spaces.map((s) => s.dayPriceCents)).toEqual([10_100, 10_200, 10_300]);

    const desc = await searchPublishedSpaces({ sort: "price_desc", limit: 3 });
    expect(desc.spaces.map((s) => s.dayPriceCents)).toEqual([13_000, 12_900, 12_800]);
  });

  it("sorts by most recent first for relevance without a position", async () => {
    const result = await searchPublishedSpaces({ limit: 2 });
    expect(result.spaces.map((s) => s.slug)).toEqual(["space-30", "space-29"]);
  });

  it("filters by space type and maximum price", async () => {
    rows[0] = row(1, { type: "DESK", dayPriceCents: 5_000 });
    rows[1] = row(2, { type: "DESK", dayPriceCents: 50_000 });

    const result = await searchPublishedSpaces({ type: "DESK", maxPriceCents: 10_000 });
    expect(result.spaces.map((s) => s.slug)).toEqual(["space-1"]);
    expect(result.total).toBe(1);
  });

  it("ignores an unknown space type instead of passing it to the query", async () => {
    await searchPublishedSpaces({ type: "BALLROOM" });
    const args = spaceFindMany.mock.calls[0][0] as Args;
    expect(args.where).not.toHaveProperty("type");
  });
});

describe("searchPublishedSpaces — date filter and distance (in memory)", () => {
  it("filters availability then paginates what is left", async () => {
    isSpaceAvailableOnDate.mockImplementation(async (id: string) => Number(id.slice(3)) % 2 === 0);

    const result = await searchPublishedSpaces({ date: "2026-10-12", limit: 10, page: 2 });
    expect(result.total).toBe(15);
    expect(result.spaces).toHaveLength(5);
    const args = spaceFindMany.mock.calls[0][0] as Args;
    expect(args.take).toBe(IN_MEMORY_CANDIDATE_CAP);
    expect(args.skip).toBe(0);
  });

  it("orders by distance for relevance, spaces without coordinates last", async () => {
    rows = [
      row(1, { property: { latitude: 45.76, longitude: 4.83 } }), // Lyon
      row(2, { property: { latitude: null, longitude: null } }),
      row(3, { property: { latitude: 48.86, longitude: 2.35 } }), // Paris
    ];
    const result = await searchPublishedSpaces({ near: { lat: 48.85, lng: 2.34 } });
    expect(result.spaces.map((s) => s.slug)).toEqual(["space-3", "space-1", "space-2"]);
    expect(result.spaces[0].distanceKm).toBeLessThan(2);
    expect(result.spaces[2].distanceKm).toBeNull();
  });
});
