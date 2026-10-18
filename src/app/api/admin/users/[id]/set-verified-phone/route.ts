import { NextResponse } from "next/server";
import { z } from "zod";
import { adminSetVerifiedPhoneSchema } from "@/lib/validation/phone-verification";
import { requireAdmin } from "@/server/auth/rbac";
import { adminSetVerifiedPhone } from "@/server/domains/admin/users";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/users/[id]/set-verified-phone — Body: { newPhone, reason }.
// Auth: platform administration. Support-assisted only — no self-service
// equivalent exists (see phone-verification.ts's doc comment).
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const targetId = z.uuid().parse(id);
  const { newPhone, reason } = adminSetVerifiedPhoneSchema.parse(await request.json().catch(() => null));
  const result = await adminSetVerifiedPhone(ctx.userId, targetId, newPhone, reason);
  return NextResponse.json(result);
});
