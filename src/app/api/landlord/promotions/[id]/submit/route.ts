import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/rbac";
import { ForbiddenError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";
import { requirePromotionOrgAccess } from "@/server/domains/promotions/access";
import { submitPromotion } from "@/server/domains/promotions/partner";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/landlord/promotions/[id]/submit — DRAFT or REJECTED -> PENDING,
// entering the admin moderation queue.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAuth();
  if (!ctx.activeOrgId) throw new ForbiddenError("Aucune organisation active.");
  await requirePromotionOrgAccess(ctx.activeOrgId);
  const { id } = await params;
  const promotion = await submitPromotion(ctx.activeOrgId, ctx.userId, id);
  return NextResponse.json({ promotion });
});
