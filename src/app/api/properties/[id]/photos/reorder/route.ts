import { NextResponse } from "next/server";
import { reorderPhotosSchema } from "@/lib/validation/properties";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { reorderPropertyPhotos } from "@/server/domains/properties/photos";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const { id } = await params;
  const { ctx } = await requirePropertyManageAccess(id);
  const { photoIds } = reorderPhotosSchema.parse(await request.json());
  await reorderPropertyPhotos(id, photoIds, ctx);
  return NextResponse.json({ ok: true });
});
