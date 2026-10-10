import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { requireOrgCapability } from "@/server/domains/organizations/require-org-capability";
import { reviewReplySchema } from "@/lib/validation/reviews";
import { replyToReview } from "@/server/domains/reviews/reviews";
import { NotFoundError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/landlord/reviews/[id]/reply — Body: { reply: string }.
// Auth: landlord:manage_bookings in the active organization; a review of
// another organization is a 404. One public reply per review (409 after).
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireOrgCapability("landlord:manage_bookings");
  await enforceRateLimit({
    key: `review:write:user:${ctx.userId}`,
    config: RATE_LIMITS.reviewWrite,
    endpoint: "POST /api/landlord/reviews/[id]/reply",
    scope: "user",
    onStoreError: "allow",
  });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw new NotFoundError("Avis introuvable.");
  const { reply } = reviewReplySchema.parse(await request.json().catch(() => null));
  const result = await replyToReview({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    reviewId: id,
    reply,
  });
  return NextResponse.json(result);
});
