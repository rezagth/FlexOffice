import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression test for the access-code leak (audit 06/10/2026, B-06).
 *
 * Public reads used `include`, which returns every scalar column of a
 * Space — `accessInstructions` (door / key-box codes) included — and the
 * result was serialized into GET /api/spaces and into the RSC payload of
 * `/` and `/search`. These tests fail if a public read goes back to
 * `include`, or if a private column is added to the public allow-list.
 */

const spaceFindMany = vi.fn();
const spaceFindFirst = vi.fn();
const favoriteFindMany = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    space: { findMany: spaceFindMany, findFirst: spaceFindFirst },
    favorite: { findMany: favoriteFindMany },
  },
}));
vi.mock("@/server/domains/media/photo-storage", () => ({
  getPublicPhotoUrl: (path: string) => `https://cdn.test/${path}`,
}));
vi.mock("@/server/domains/analytics/search-events", () => ({
  recordSearchEvent: vi.fn(),
}));

process.env.DATABASE_URL = "postgresql://test/test";

const { listPublishedSpaces, getPublishedSpaceBySlug, listFavoriteSpaces } = await import(
  "@/server/domains/spaces/list-spaces"
);

const PRIVATE_COLUMNS = [
  "accessInstructions",
  "organizationId",
  "propertyId",
  "amenitiesLegacy",
  "createdAt",
  "updatedAt",
];

function queryArgs(mock: ReturnType<typeof vi.fn>) {
  expect(mock).toHaveBeenCalledTimes(1);
  return mock.mock.calls[0][0] as { select?: Record<string, unknown>; include?: unknown };
}

beforeEach(() => {
  spaceFindMany.mockReset().mockResolvedValue([]);
  spaceFindFirst.mockReset().mockResolvedValue(null);
  favoriteFindMany.mockReset().mockResolvedValue([]);
});

describe("public space reads never select private columns", () => {
  it("listPublishedSpaces uses an explicit select without private columns", async () => {
    await listPublishedSpaces({ city: "Paris" });
    const args = queryArgs(spaceFindMany);

    expect(args.include).toBeUndefined();
    expect(args.select).toBeDefined();
    for (const column of PRIVATE_COLUMNS) {
      expect(args.select).not.toHaveProperty(column);
    }
  });

  it("getPublishedSpaceBySlug uses an explicit select without private columns", async () => {
    await getPublishedSpaceBySlug("salle-rivoli");
    const args = queryArgs(spaceFindFirst);

    expect(args.include).toBeUndefined();
    expect(args.select).toBeDefined();
    for (const column of PRIVATE_COLUMNS) {
      expect(args.select).not.toHaveProperty(column);
    }
  });

  it("listFavoriteSpaces selects only public columns of the favorited space", async () => {
    await listFavoriteSpaces("user-1");
    const args = queryArgs(favoriteFindMany) as {
      where: { userId: string };
      select: { space: { select: Record<string, unknown> } };
    };

    expect(args.where.userId).toBe("user-1");
    const spaceSelect = args.select.space.select;
    expect(spaceSelect).toBeDefined();
    for (const column of PRIVATE_COLUMNS) {
      expect(spaceSelect).not.toHaveProperty(column);
    }
  });
});
