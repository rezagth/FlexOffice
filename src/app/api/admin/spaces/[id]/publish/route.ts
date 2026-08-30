import { NextResponse } from "next/server";
import { requireRole } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { publishSpace } from "@/server/domains/organizations/moderate-space";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/spaces/[id]/publish — PENDING_REVIEW -> PUBLISHED.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireRole("ADMIN");
  const { id } = await params;
  await publishSpace(ctx.userId, id);
  return NextResponse.json({ status: "PUBLISHED" });
});
