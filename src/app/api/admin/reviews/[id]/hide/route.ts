import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/rbac";
import { hideReviewSchema } from "@/lib/validation/reviews";
import { setReviewHidden } from "@/server/domains/reviews/reviews";
import { NotFoundError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/reviews/[id]/hide — Body: { reason: string }.
// Auth: platform administration. Hides the review from the public pages and
// the averages; the text is kept, the action audited.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw new NotFoundError("Avis introuvable.");
  const { reason } = hideReviewSchema.parse(await request.json().catch(() => null));
  const result = await setReviewHidden({ adminUserId: ctx.userId, reviewId: id, hidden: true, reason });
  return NextResponse.json(result);
});
