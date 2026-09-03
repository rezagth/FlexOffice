import { NextResponse } from "next/server";
import { reorderPhotosSchema } from "@/lib/validation/properties";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { getSpaceForProperty } from "@/server/domains/properties/spaces";
import { reorderSpacePhotos } from "@/server/domains/properties/space-photos";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string; spaceId: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const { id: propertyId, spaceId } = await params;
  const { ctx } = await requirePropertyManageAccess(propertyId);
  await getSpaceForProperty(propertyId, spaceId);
  const { photoIds } = reorderPhotosSchema.parse(await request.json());
  await reorderSpacePhotos(spaceId, photoIds, ctx);
  return NextResponse.json({ ok: true });
});
