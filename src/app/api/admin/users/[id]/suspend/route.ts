import { NextResponse } from "next/server";
import { z } from "zod";
import { requiredReasonSchema } from "@/lib/validation/admin";
import { requireAdmin } from "@/server/auth/rbac";
import { suspendUser } from "@/server/domains/admin/users";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/users/[id]/suspend — Body: { reason: string }.
// Auth: platform administration. An admin cannot suspend themselves (403).
// From the next request on, the account has no valid session anywhere.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const targetId = z.uuid().parse(id);
  const { reason } = requiredReasonSchema.parse(await request.json().catch(() => null));
  const result = await suspendUser(ctx.userId, targetId, reason);
  return NextResponse.json(result);
});
