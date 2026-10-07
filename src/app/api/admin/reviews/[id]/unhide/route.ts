import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/rbac";
import { setReviewHidden } from "@/server/domains/reviews/reviews";
import { NotFoundError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/reviews/[id]/unhide — Auth: platform administration.
// Makes a hidden review public again (audited).
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw new NotFoundError("Avis introuvable.");
  const result = await setReviewHidden({ adminUserId: ctx.userId, reviewId: id, hidden: false });
  return NextResponse.json(result);
});
