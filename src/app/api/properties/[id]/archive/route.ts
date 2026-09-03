import { NextResponse } from "next/server";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { archiveProperty } from "@/server/domains/properties/archive";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/properties/[id]/archive — status flip, never a hard delete.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  const { ctx } = await requirePropertyManageAccess(id);
  const property = await archiveProperty(id, ctx);
  return NextResponse.json({ property });
});
