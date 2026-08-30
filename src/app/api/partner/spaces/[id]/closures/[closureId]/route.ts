import { NextResponse } from "next/server";
import { requireOrg } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { deleteClosure } from "@/server/domains/organizations/closures";

type Ctx = { params: Promise<{ id: string; closureId: string }> };

export const DELETE = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireOrg();
  const { id, closureId } = await params;
  await deleteClosure(ctx.organizationId, id, closureId);
  return NextResponse.json({ deleted: true });
});
