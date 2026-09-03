import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { takeChargeOfDispute } from "@/server/domains/disputes/review";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  await takeChargeOfDispute(id, ctx.userId);
  return NextResponse.json({ ok: true });
});
