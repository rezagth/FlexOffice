import { NextResponse } from "next/server";
import { withErrorHandling } from "@/server/lib/http";
import { requireOrgCapability } from "@/server/domains/organizations/require-org-capability";
import { deleteClosure } from "@/server/domains/organizations/closures";

type Ctx = { params: Promise<{ id: string; closureId: string }> };

export const DELETE = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireOrgCapability("landlord:manage_calendar");
  const { id, closureId } = await params;
  await deleteClosure(ctx.organizationId, id, closureId);
  return NextResponse.json({ deleted: true });
});
