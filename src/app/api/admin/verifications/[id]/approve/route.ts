import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { approveVerification } from "@/server/domains/verification/review";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/verifications/[id]/approve
// Auth: required, platform administration only. Refuses self-review
//   (Cas 4 — an admin who requested this dossier cannot approve it).
// Sets Organization.status = VERIFIED — see review.ts for why this is the
//   only place that happens.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  await approveVerification(id, ctx.userId);
  return NextResponse.json({ status: "APPROVED" });
});
