import { beforeEach, describe, expect, it, vi } from "vitest";

const spaceFindFirst = vi.fn();
const getPublicPhotoUrlMock = vi.fn((path: string) => `https://cdn.test/${path}`);

vi.mock("@/server/db/prisma", () => ({
  prisma: { space: { findFirst: spaceFindFirst, findMany: vi.fn() } },
}));

vi.mock("@/server/domains/media/photo-storage", () => ({
  getPublicPhotoUrl: getPublicPhotoUrlMock,
}));

vi.mock("@/server/domains/analytics/search-events", () => ({
  recordSearchEvent: vi.fn(),
}));

process.env.DATABASE_URL = "postgresql://test/test";

const { getPublishedSpaceBySlug } = await import("@/server/domains/spaces/list-spaces");

const BASE_SPACE = {
  id: "space-1",
  slug: "salle-rivoli",
  name: "Salle Rivoli",
  photos: [] as string[],
  organization: { name: "Atelier Partners" },
  openingHours: [],
};

beforeEach(() => {
  spaceFindFirst.mockReset();
  getPublicPhotoUrlMock.mockClear();
});

describe("getPublishedSpaceBySlug — real photos", () => {
  it("returns SpacePhoto-backed URLs, ordered primary-first then by position", async () => {
    spaceFindFirst.mockResolvedValue({
      ...BASE_SPACE,
      spacePhotos: [
        { storagePath: "spaces/space-1/primary.jpg" },
        { storagePath: "spaces/space-1/second.jpg" },
      ],
    });

    const space = await getPublishedSpaceBySlug("salle-rivoli");

    expect(space?.photos).toEqual([
      "https://cdn.test/spaces/space-1/primary.jpg",
      "https://cdn.test/spaces/space-1/second.jpg",
    ]);
    // The include, not an app-level sort, is what orders them — confirms
    // the query asked the database for primary-first ordering.
    expect(spaceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          spacePhotos: expect.objectContaining({
            orderBy: [{ isPrimary: "desc" }, { position: "asc" }],
          }),
        }),
      })
    );
  });

  it("does not crash and falls back cleanly when a space has no photos at all", async () => {
    spaceFindFirst.mockResolvedValue({ ...BASE_SPACE, spacePhotos: [] });

    const space = await getPublishedSpaceBySlug("salle-rivoli");

    expect(space?.photos).toEqual([]);
    expect(getPublicPhotoUrlMock).not.toHaveBeenCalled();
  });

  it("returns null for an unknown slug without touching photo resolution", async () => {
    spaceFindFirst.mockResolvedValue(null);

    const space = await getPublishedSpaceBySlug("does-not-exist");

    expect(space).toBeNull();
    expect(getPublicPhotoUrlMock).not.toHaveBeenCalled();
  });
});
