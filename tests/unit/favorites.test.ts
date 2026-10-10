import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal in-memory stand-in for the `favorites` table, keyed the same way
// Postgres is (composite userId+spaceId) — real enough to prove ownership
// scoping actually isolates rows, not just that some `where` shape was
// passed.
let rows: { userId: string; spaceId: string }[] = [];
const key = (userId: string, spaceId: string) => `${userId}:${spaceId}`;

type CompositeWhere = { where: { userId_spaceId: { userId: string; spaceId: string } } };

const spaceFindUnique = vi.fn();

const favoriteUpsert = vi.fn(async ({ where, create }: CompositeWhere & { create: { userId: string; spaceId: string } }) => {
  const k = key(where.userId_spaceId.userId, where.userId_spaceId.spaceId);
  if (!rows.some((r) => key(r.userId, r.spaceId) === k)) rows.push({ ...create });
  return create;
});

const favoriteDeleteMany = vi.fn(async ({ where }: { where: { userId: string; spaceId: string } }) => {
  const before = rows.length;
  rows = rows.filter((r) => !(r.userId === where.userId && r.spaceId === where.spaceId));
  return { count: before - rows.length };
});

const favoriteFindUnique = vi.fn(async ({ where }: CompositeWhere) => {
  const k = key(where.userId_spaceId.userId, where.userId_spaceId.spaceId);
  return rows.some((r) => key(r.userId, r.spaceId) === k) ? { userId: where.userId_spaceId.userId } : null;
});

const favoriteFindMany = vi.fn(
  async ({ where }: { where: { userId: string; spaceId: { in: string[] } } }) => {
    return rows
      .filter((r) => r.userId === where.userId && where.spaceId.in.includes(r.spaceId))
      .map((r) => ({ spaceId: r.spaceId }));
  }
);

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    space: { findUnique: spaceFindUnique },
    favorite: {
      upsert: favoriteUpsert,
      deleteMany: favoriteDeleteMany,
      findUnique: favoriteFindUnique,
      findMany: favoriteFindMany,
    },
  },
}));

const { addFavorite, removeFavorite, getFavoritedSpaceIds, isSpaceFavorited } = await import(
  "@/server/domains/favorites/favorites"
);

const USER_A = "user-a";
const USER_B = "user-b";
const SPACE_1 = "space-1";

beforeEach(() => {
  rows = [];
  spaceFindUnique.mockReset().mockResolvedValue({ id: SPACE_1 });
  favoriteUpsert.mockClear();
  favoriteDeleteMany.mockClear();
  favoriteFindUnique.mockClear();
  favoriteFindMany.mockClear();
});

describe("removeFavorite — ownership scoping (authorization)", () => {
  it("never removes another user's favorite for the same space", async () => {
    await addFavorite(USER_A, SPACE_1);
    await addFavorite(USER_B, SPACE_1);

    // User A attempts to remove what is, for them, a favorite on SPACE_1 —
    // it must only ever touch A's own row.
    await removeFavorite(USER_A, SPACE_1);

    expect(await isSpaceFavorited(USER_A, SPACE_1)).toBe(false);
    expect(await isSpaceFavorited(USER_B, SPACE_1)).toBe(true);
  });

  it("is a harmless no-op when the caller never favorited that space", async () => {
    await addFavorite(USER_B, SPACE_1);

    await expect(removeFavorite(USER_A, SPACE_1)).resolves.toBeUndefined();

    expect(await isSpaceFavorited(USER_B, SPACE_1)).toBe(true);
  });
});

describe("addFavorite", () => {
  it("throws NotFoundError for a space that does not exist", async () => {
    spaceFindUnique.mockResolvedValue(null);

    await expect(addFavorite(USER_A, "does-not-exist")).rejects.toThrow(/introuvable/);
    expect(favoriteUpsert).not.toHaveBeenCalled();
  });

  it("is idempotent — favoriting the same space twice does not error", async () => {
    await addFavorite(USER_A, SPACE_1);
    await expect(addFavorite(USER_A, SPACE_1)).resolves.toBeUndefined();

    const ids = await getFavoritedSpaceIds(USER_A, [SPACE_1]);
    expect(ids.has(SPACE_1)).toBe(true);
  });
});
