import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/rbac";
import { removeFavorite } from "@/server/domains/favorites/favorites";
import { withErrorHandling } from "@/server/lib/http";
import { enforceRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";

type Ctx = { params: Promise<{ spaceId: string }> };

// DELETE /api/favorites/[spaceId] — removes a space from the caller's own
// favorites. Auth: any authenticated user. Scoped by ctx.userId AND
// spaceId together (see removeFavorite) — a spaceId that isn't the
// caller's own favorite matches nothing and is a harmless no-op, never an
// action on someone else's favorite.
export const DELETE = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAuth();
  await enforceRateLimit({
    key: `favorite:toggle:user:${ctx.userId}`,
    config: RATE_LIMITS.favoriteToggle,
    endpoint: "DELETE /api/favorites/[spaceId]",
    scope: "user",
    onStoreError: "allow",
  });
  const { spaceId } = await params;

  await removeFavorite(ctx.userId, spaceId);

  return NextResponse.json({ spaceId, favorited: false });
});
