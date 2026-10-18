import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/rbac";
import { ForbiddenError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";
import { requirePromotionOrgAccess } from "@/server/domains/promotions/access";
import { createPromotion, listPromotionsForOrganization } from "@/server/domains/promotions/partner";
import { promotionSchema } from "@/lib/validation/promotions";

// GET /api/landlord/promotions — the active organization's own promotions.
export const GET = withErrorHandling(async () => {
  const ctx = await requireAuth();
  if (!ctx.activeOrgId) throw new ForbiddenError("Aucune organisation active.");
  await requirePromotionOrgAccess(ctx.activeOrgId);
  const promotions = await listPromotionsForOrganization(ctx.activeOrgId);
  return NextResponse.json({ promotions });
});

// POST /api/landlord/promotions — creates a DRAFT promotion on one or more
// of the active organization's own spaces. Submitting it for review is a
// separate, explicit action (POST .../[id]/submit).
export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requireAuth();
  if (!ctx.activeOrgId) throw new ForbiddenError("Aucune organisation active.");
  await requirePromotionOrgAccess(ctx.activeOrgId);
  const input = promotionSchema.parse(await request.json());
  const promotion = await createPromotion(ctx.activeOrgId, ctx.userId, input);
  return NextResponse.json({ promotion }, { status: 201 });
});
