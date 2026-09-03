import { NextResponse } from "next/server";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { getSpaceForProperty } from "@/server/domains/properties/spaces";
import { removeSpacePhoto } from "@/server/domains/properties/space-photos";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string; spaceId: string; photoId: string }> };

export const DELETE = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { id: propertyId, spaceId, photoId } = await params;
  const { ctx } = await requirePropertyManageAccess(propertyId);
  await getSpaceForProperty(propertyId, spaceId);
  await removeSpacePhoto(spaceId, photoId, ctx);
  return NextResponse.json({ deleted: true });
});
