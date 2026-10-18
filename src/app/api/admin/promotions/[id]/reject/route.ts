import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { rejectPromotion } from "@/server/domains/promotions/admin";
import { rejectPromotionSchema } from "@/lib/validation/promotions";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/promotions/[id]/reject — Auth: platform administration.
// Body: { reason, note? } — reason is mandatory (fixed list), note is
// mandatory only when reason is "OTHER" — see rejectPromotionSchema.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const { reason, note } = rejectPromotionSchema.parse(await request.json().catch(() => null));
  const promotion = await rejectPromotion(ctx.userId, id, reason, note);
  return NextResponse.json({ promotion });
});
