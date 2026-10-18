import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/rbac";
import { ForbiddenError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";
import { requirePromotionOrgAccess } from "@/server/domains/promotions/access";
import { getPromotionForOrganization, updatePromotion } from "@/server/domains/promotions/partner";
import { promotionSchema } from "@/lib/validation/promotions";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/landlord/promotions/[id] — one of the active organization's own
// promotions, for the edit form.
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAuth();
  if (!ctx.activeOrgId) throw new ForbiddenError("Aucune organisation active.");
  await requirePromotionOrgAccess(ctx.activeOrgId);
  const { id } = await params;
  const promotion = await getPromotionForOrganization(ctx.activeOrgId, id);
  return NextResponse.json({ promotion });
});

// PATCH /api/landlord/promotions/[id] — edits a promotion the caller's
// organization owns. A PUBLISHED or REJECTED promotion reverts to PENDING —
// see updatePromotion()'s own doc comment.
export const PATCH = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAuth();
  if (!ctx.activeOrgId) throw new ForbiddenError("Aucune organisation active.");
  await requirePromotionOrgAccess(ctx.activeOrgId);
  const { id } = await params;
  const input = promotionSchema.parse(await request.json());
  const promotion = await updatePromotion(ctx.activeOrgId, ctx.userId, id, input);
  return NextResponse.json({ promotion });
});
