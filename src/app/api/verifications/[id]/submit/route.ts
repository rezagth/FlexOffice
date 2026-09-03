import { NextResponse } from "next/server";
import { requireVerificationOwnerAccess } from "@/server/domains/verification/access";
import { submitVerification } from "@/server/domains/verification/submit";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/verifications/[id]/submit
// Auth: required, caller must hold landlord:manage_verification for the
//   dossier's OWN organization (checked against the id in the URL, not
//   assumed from the session — see access.ts).
// DRAFT|REJECTED -> PENDING_REVIEW, only once every required document type
//   (per holderType + activityType) has at least one upload.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  const { ctx, verification } = await requireVerificationOwnerAccess(id);

  const updated = await submitVerification({
    verification,
    organizationId: verification.organizationId,
    holderType: verification.organization.holderType,
    actorProfileId: ctx.userId,
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
});
