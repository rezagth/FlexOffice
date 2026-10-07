import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/rbac";
import { reactivateUser } from "@/server/domains/admin/users";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/users/[id]/reactivate — lifts a suspension.
// Auth: platform administration.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const result = await reactivateUser(ctx.userId, z.uuid().parse(id));
  return NextResponse.json(result);
});
