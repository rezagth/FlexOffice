import { prisma } from "@/server/db/prisma";
import { NotFoundError } from "@/server/lib/errors";

/**
 * Adds a space to the caller's favorites. Idempotent: favoriting an
 * already-favorited space is a no-op rather than a conflict — the
 * composite primary key (userId, spaceId) makes a repeat call harmless, and
 * the client shouldn't have to special-case "already favorited".
 *
 * `userId` always comes from the verified session (ctx.userId), never from
 * the request body — see addFavoriteSchema.
 */
export async function addFavorite(userId: string, spaceId: string) {
  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!space) throw new NotFoundError("Espace introuvable");

  await prisma.favorite.upsert({
    where: { userId_spaceId: { userId, spaceId } },
    create: { userId, spaceId },
    update: {},
  });
}

/**
 * Removes a space from the caller's favorites. Scoped by `userId` (the
 * caller's own session) AND `spaceId` in the same `where` — a spaceId that
 * belongs to someone else's favorite, not the caller's, simply matches no
 * row: the caller can never affect another user's favorites, and doesn't
 * get told one way or the other whether that other favorite exists.
 * Removing a favorite that was never there is a no-op, not an error —
 * DELETE is idempotent here the same way it already is elsewhere.
 */
export async function removeFavorite(userId: string, spaceId: string) {
  await prisma.favorite.deleteMany({ where: { userId, spaceId } });
}

/** Whether the caller already favorited this one space — the space detail
 * page's single-space counterpart of getFavoritedSpaceIds() below. */
export async function isSpaceFavorited(userId: string, spaceId: string): Promise<boolean> {
  const favorite = await prisma.favorite.findUnique({
    where: { userId_spaceId: { userId, spaceId } },
    select: { userId: true },
  });
  return favorite !== null;
}

/** Which of `spaceIds` the caller already favorited — one query per page
 * render (search results, space detail), not one per card. */
export async function getFavoritedSpaceIds(userId: string, spaceIds: string[]): Promise<Set<string>> {
  if (spaceIds.length === 0) return new Set();
  const favorites = await prisma.favorite.findMany({
    where: { userId, spaceId: { in: spaceIds } },
    select: { spaceId: true },
  });
  return new Set(favorites.map((f) => f.spaceId));
}
