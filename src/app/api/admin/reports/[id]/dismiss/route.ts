import { NextResponse } from "next/server";
import { optionalReasonSchema } from "@/lib/validation/admin";
import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { dismissReport } from "@/server/domains/reports/reports";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/reports/[id]/dismiss — no action on the space. Body:
// { reason? } kept as an internal note on the report.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const { reason } = optionalReasonSchema.parse(await request.json().catch(() => ({})));
  await dismissReport(ctx.userId, id, reason);
  return NextResponse.json({ status: "DISMISSED" });
});
