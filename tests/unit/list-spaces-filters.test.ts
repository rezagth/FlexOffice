import { beforeEach, describe, expect, it, vi } from "vitest";

const SPACE_SMALL = {
  id: "space-small",
  slug: "small",
  city: "Paris",
  capacity: 4,
  amenities: ["WIFI"],
  photos: [] as string[],
  spacePhotos: [] as { storagePath: string }[],
  organization: { name: "Atelier Partners" },
  property: { latitude: null as number | null, longitude: null as number | null },
};

const SPACE_BIG = {
  id: "space-big",
  slug: "big",
  city: "Paris",
  capacity: 12,
  amenities: ["WIFI", "PARKING"],
  photos: [] as string[],
  spacePhotos: [] as { storagePath: string }[],
  organization: { name: "Atelier Partners" },
  property: { latitude: null as number | null, longitude: null as number | null },
};

const ALL_SPACES = [SPACE_SMALL, SPACE_BIG];

// A minimal in-memory stand-in for Postgres' evaluation of the `where`
// clause list-spaces.ts builds — proves the capacity/amenities filters
// actually exclude the right rows, not just that some object was passed.
const spaceFindMany = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
  return ALL_SPACES.filter((space) => {
    const capacityFilter = where.capacity as { gte: number } | undefined;
    if (capacityFilter && !(space.capacity >= capacityFilter.gte)) return false;
    const amenitiesFilter = where.amenities as { hasEvery: string[] } | undefined;
    if (amenitiesFilter && !amenitiesFilter.hasEvery.every((a) => space.amenities.includes(a))) {
      return false;
    }
    return true;
  });
});

const isSpaceAvailableOnDateMock = vi.fn<(spaceId: string, dateStr: string) => Promise<boolean>>();

vi.mock("@/server/db/prisma", () => ({
  prisma: { space: { findMany: spaceFindMany, findFirst: vi.fn() } },
}));

vi.mock("@/server/domains/media/photo-storage", () => ({
  getPublicPhotoUrl: (path: string) => `https://cdn.test/${path}`,
}));

vi.mock("@/server/domains/analytics/search-events", () => ({
  recordSearchEvent: vi.fn(),
}));

vi.mock("@/server/domains/bookings/availability", () => ({
  isSpaceAvailableOnDate: isSpaceAvailableOnDateMock,
}));

process.env.DATABASE_URL = "postgresql://test/test";

const { listPublishedSpaces } = await import("@/server/domains/spaces/list-spaces");

beforeEach(() => {
  spaceFindMany.mockClear();
  isSpaceAvailableOnDateMock.mockReset().mockResolvedValue(true);
});

describe("listPublishedSpaces — capacity filter", () => {
  it("excludes a space whose capacity is below the requested minimum", async () => {
    const result = await listPublishedSpaces({ capacity: 10 });

    expect(result.map((s) => s.slug)).toEqual(["big"]);
  });

  it("keeps every space when no capacity filter is requested", async () => {
    const result = await listPublishedSpaces({});

    expect(result.map((s) => s.slug).sort()).toEqual(["big", "small"]);
  });
});

describe("listPublishedSpaces — date filter", () => {
  it("excludes a space that is fully booked or closed on the requested date", async () => {
    isSpaceAvailableOnDateMock.mockImplementation(async (spaceId: string) => spaceId !== "space-big");

    const result = await listPublishedSpaces({ date: "2026-09-10" });

    expect(result.map((s) => s.slug)).toEqual(["small"]);
    expect(isSpaceAvailableOnDateMock).toHaveBeenCalledWith("space-small", "2026-09-10");
    expect(isSpaceAvailableOnDateMock).toHaveBeenCalledWith("space-big", "2026-09-10");
  });
});
