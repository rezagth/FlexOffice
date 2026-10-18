import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { approvePromotion } from "@/server/domains/promotions/admin";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/promotions/[id]/approve — Auth: platform administration.
// PENDING -> PUBLISHED, refused if it would overlap another published
// promotion on any of the same spaces.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const promotion = await approvePromotion(ctx.userId, id);
  return NextResponse.json({ promotion });
});
