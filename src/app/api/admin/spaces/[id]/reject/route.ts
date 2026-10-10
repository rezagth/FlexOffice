import { NextResponse } from "next/server";
import { optionalReasonSchema } from "@/lib/validation/admin";
import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { rejectSpace } from "@/server/domains/organizations/moderate-space";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/spaces/[id]/reject — PENDING_REVIEW -> REJECTED.
// Body (optional): { reason?: string } — passed on to the landlord's e-mail.
// Auth: platform administration.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const text = await request.text();
  const { reason } = optionalReasonSchema.parse(text ? safeJson(text) : {});
  await rejectSpace(ctx.userId, id, reason || null);
  return NextResponse.json({ status: "REJECTED" });
});

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
