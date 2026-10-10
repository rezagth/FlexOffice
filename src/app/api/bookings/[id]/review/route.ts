import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/server/auth/rbac";
import { enforceRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { createReviewSchema } from "@/lib/validation/reviews";
import { createReview } from "@/server/domains/reviews/reviews";
import { NotFoundError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/bookings/[id]/review — Body: { rating: 1-5, comment?: string }.
// Auth: the client who made the booking (scoped by the session's userId:
// anyone else's booking is a 404). Once the booking is over, within
// REVIEW_WINDOW_DAYS, once (409 otherwise). See domains/reviews/reviews.ts.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAuth();
  await enforceRateLimit({
    key: `review:write:user:${ctx.userId}`,
    config: RATE_LIMITS.reviewWrite,
    endpoint: "POST /api/bookings/[id]/review",
    scope: "user",
    onStoreError: "allow",
  });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw new NotFoundError("Réservation introuvable.");
  const input = createReviewSchema.parse(await request.json().catch(() => null));
  const review = await createReview(ctx.userId, id, input);
  return NextResponse.json({ id: review.id }, { status: 201 });
});
