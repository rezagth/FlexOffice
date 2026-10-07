import { NextResponse } from "next/server";
import { withErrorHandling } from "@/server/lib/http";
import { requireOrgCapability } from "@/server/domains/organizations/require-org-capability";
import { submitSpaceForReview } from "@/server/domains/organizations/submit-space";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/partner/spaces/[id]/submit — DRAFT|REJECTED -> PENDING_REVIEW.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireOrgCapability("landlord:publish_listing");
  const { id } = await params;
  await submitSpaceForReview(ctx.organizationId, id);
  return NextResponse.json({ status: "PENDING_REVIEW" });
});
