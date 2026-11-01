import { NextResponse } from "next/server";
import { requiredReasonSchema } from "@/lib/validation/admin";
import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { actOnReportBySpaceHide } from "@/server/domains/reports/reports";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/reports/[id]/unpublish — hide the reported space. Body:
// { reason } (required, e-mailed to the landlord). Closes every pending
// report about that space.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const { reason } = requiredReasonSchema.parse(await request.json().catch(() => null));
  await actOnReportBySpaceHide(ctx.userId, id, reason);
  return NextResponse.json({ status: "ACTIONED" });
});
