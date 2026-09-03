import { NextResponse } from "next/server";
import { rejectVerificationSchema } from "@/lib/validation/verification";
import { requireAdmin } from "@/server/auth/rbac";
import { rejectVerification } from "@/server/domains/verification/review";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/verifications/[id]/reject
// Body: { reason: string }
// Auth: required, platform administration only. Refuses self-review.
// Does not touch Organization.status — a rejection is "not yet", not a
//   suspension; see review.ts.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const { reason } = rejectVerificationSchema.parse(body);

  await rejectVerification(id, ctx.userId, reason);
  return NextResponse.json({ status: "REJECTED" });
});
