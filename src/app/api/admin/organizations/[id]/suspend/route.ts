import { NextResponse } from "next/server";
import { z } from "zod";
import { requiredReasonSchema } from "@/lib/validation/admin";
import { requireAdmin } from "@/server/auth/rbac";
import { suspendOrganization } from "@/server/domains/organizations/suspension";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/organizations/[id]/suspend — Body: { reason: string }.
// Auth: platform administration. Listings leave the catalogue at once
// (publication-guard.ts); the organization is e-mailed.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const { reason } = requiredReasonSchema.parse(await request.json().catch(() => null));
  const result = await suspendOrganization(ctx.userId, z.uuid().parse(id), reason);
  return NextResponse.json(result);
});
