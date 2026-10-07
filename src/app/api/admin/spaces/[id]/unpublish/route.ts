import { NextResponse } from "next/server";
import { requiredReasonSchema } from "@/lib/validation/admin";
import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { unpublishSpace } from "@/server/domains/organizations/moderate-space";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/spaces/[id]/unpublish — PUBLISHED -> REJECTED, out of the
// catalogue. Body: { reason: string } (required, e-mailed to the landlord).
// Auth: platform administration. Existing bookings are not cancelled.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const { reason } = requiredReasonSchema.parse(await request.json().catch(() => null));
  await unpublishSpace(ctx.userId, id, reason);
  return NextResponse.json({ status: "REJECTED" });
});
