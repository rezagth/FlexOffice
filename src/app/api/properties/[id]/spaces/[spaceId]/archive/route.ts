import { NextResponse } from "next/server";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { getSpaceForProperty, archiveSpace } from "@/server/domains/properties/spaces";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string; spaceId: string }> };

export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { id: propertyId, spaceId } = await params;
  const { ctx } = await requirePropertyManageAccess(propertyId);
  await getSpaceForProperty(propertyId, spaceId);
  const space = await archiveSpace(spaceId, ctx);
  return NextResponse.json({ space });
});
