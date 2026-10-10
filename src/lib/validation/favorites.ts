import { z } from "zod";

// No `userId` field: the favorite is always recorded for the caller's own
// session (ctx.userId, from requireAuth()) — there is nothing in this
// schema a request body could use to act on someone else's favorites.
export const addFavoriteSchema = z.object({
  spaceId: z.string().uuid(),
});
export type AddFavoriteInput = z.infer<typeof addFavoriteSchema>;
