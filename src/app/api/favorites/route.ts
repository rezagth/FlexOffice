import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/rbac";
import { addFavoriteSchema } from "@/lib/validation/favorites";
import { addFavorite } from "@/server/domains/favorites/favorites";
import { withErrorHandling } from "@/server/lib/http";

// POST /api/favorites — adds a space to the caller's own favorites.
// Auth: any authenticated user (favorites aren't role-gated, same as the
// /app/favorites page). Scoped by ctx.userId, never a body field.
export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requireAuth();
  const input = addFavoriteSchema.parse(await request.json());

  await addFavorite(ctx.userId, input.spaceId);

  return NextResponse.json({ spaceId: input.spaceId, favorited: true }, { status: 201 });
});
