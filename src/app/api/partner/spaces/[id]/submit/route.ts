import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandling } from "@/server/lib/http";
import { requireOrgCapability } from "@/server/domains/organizations/require-org-capability";
import { submitSpaceForReview } from "@/server/domains/organizations/submit-space";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  acceptPartnerTerms: z.boolean().optional(),
  certifyRightToLet: z.boolean().optional(),
});

// POST /api/partner/spaces/[id]/submit — DRAFT|REJECTED -> PENDING_REVIEW.
// The body carries the landlord's legal acceptances (see submit-space.ts); a
// missing or empty body is read as "nothing ticked" and refused with 409.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireOrgCapability("landlord:publish_listing");
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const consent = bodySchema.parse(body);
  await submitSpaceForReview(ctx.organizationId, id, ctx.userId, consent);
  return NextResponse.json({ status: "PENDING_REVIEW" });
});
