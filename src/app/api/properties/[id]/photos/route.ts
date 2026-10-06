import { NextResponse } from "next/server";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { addPropertyPhoto, listPropertyPhotos } from "@/server/domains/properties/photos";
import { withErrorHandling } from "@/server/lib/http";
import { ValidationError } from "@/server/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  await requirePropertyManageAccess(id);
  const photos = await listPropertyPhotos(id);
  return NextResponse.json({ photos });
});

export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const { id } = await params;
  const { ctx } = await requirePropertyManageAccess(id);
  await enforceRateLimit({
    key: `photo:upload:user:${ctx.userId}`,
    config: RATE_LIMITS.photoUpload,
    endpoint: "POST /api/properties/[id]/photos",
    scope: "user",
    onStoreError: "deny",
  });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new ValidationError("Fichier manquant.");

  const photo = await addPropertyPhoto(id, ctx, file);
  return NextResponse.json({ photo }, { status: 201 });
});
