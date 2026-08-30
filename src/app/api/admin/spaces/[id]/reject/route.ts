import { NextResponse } from "next/server";
import { requireRole } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { rejectSpace } from "@/server/domains/organizations/moderate-space";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/spaces/[id]/reject — PENDING_REVIEW -> REJECTED.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireRole("ADMIN");
  const { id } = await params;
  await rejectSpace(ctx.userId, id);
  return NextResponse.json({ status: "REJECTED" });
});
