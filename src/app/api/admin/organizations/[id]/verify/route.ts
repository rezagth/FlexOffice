import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/rbac";
import { verifyOrganizationManually } from "@/server/domains/organizations/manual-verification";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ reason: z.string().trim().max(500).optional() });

// POST /api/admin/organizations/[id]/verify — validates a company that has no
// landlord dossier (e.g. a tenant-only company). Auth: platform administration.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;
  const { reason } = bodySchema.parse(await request.json().catch(() => ({})));
  const result = await verifyOrganizationManually(ctx.userId, z.uuid().parse(id), reason);
  return NextResponse.json(result);
});
