import { NextResponse } from "next/server";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { getSpaceForProperty } from "@/server/domains/properties/spaces";
import { addSpacePhoto, listSpacePhotos } from "@/server/domains/properties/space-photos";
import { withErrorHandling } from "@/server/lib/http";
import { readUploadedFile } from "@/server/domains/media/multipart";
import { enforceRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";

type Ctx = { params: Promise<{ id: string; spaceId: string }> };

export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { id: propertyId, spaceId } = await params;
  await requirePropertyManageAccess(propertyId, "landlord:view_dashboard");
  await getSpaceForProperty(propertyId, spaceId);
  const photos = await listSpacePhotos(spaceId);
  return NextResponse.json({ photos });
});

export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const { id: propertyId, spaceId } = await params;
  const { ctx } = await requirePropertyManageAccess(propertyId, "landlord:manage_spaces");
  await enforceRateLimit({
    key: `photo:upload:user:${ctx.userId}`,
    config: RATE_LIMITS.photoUpload,
    endpoint: "POST /api/properties/[id]/spaces/[spaceId]/photos",
    scope: "user",
    onStoreError: "deny",
  });
  await getSpaceForProperty(propertyId, spaceId);

  const file = await readUploadedFile(request);

  const photo = await addSpacePhoto(spaceId, ctx, file);
  return NextResponse.json({ photo }, { status: 201 });
});
