import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/rbac";
import { reactivateOrganization } from "@/server/domains/organizations/suspension";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/organizations/[id]/reactivate — back to VERIFIED when an
// approved dossier exists, PENDING_VERIFICATION otherwise.
// Auth: platform administration.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const result = await reactivateOrganization(ctx.userId, z.uuid().parse(id));
  return NextResponse.json(result);
});
