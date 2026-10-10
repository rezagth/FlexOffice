import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { publishSpace } from "@/server/domains/organizations/moderate-space";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/spaces/[id]/publish — PENDING_REVIEW -> PUBLISHED.
// Auth: platform administration. The landlord is e-mailed (best-effort).
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  await publishSpace(ctx.userId, id);
  return NextResponse.json({ status: "PUBLISHED" });
});
