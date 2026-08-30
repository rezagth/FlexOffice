import { NextResponse } from "next/server";
import { requireOrg } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { submitSpaceForReview } from "@/server/domains/organizations/submit-space";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/partner/spaces/[id]/submit — DRAFT|REJECTED -> PENDING_REVIEW.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireOrg();
  const { id } = await params;
  await submitSpaceForReview(ctx.organizationId, id);
  return NextResponse.json({ status: "PENDING_REVIEW" });
});
