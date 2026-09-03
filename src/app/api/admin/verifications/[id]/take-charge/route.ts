import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { takeChargeOfVerification } from "@/server/domains/verification/review";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/verifications/[id]/take-charge — PENDING_REVIEW -> IN_REVIEW.
// Auth: required, platform administration only.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  await takeChargeOfVerification(id, ctx.userId);
  return NextResponse.json({ status: "IN_REVIEW" });
});
