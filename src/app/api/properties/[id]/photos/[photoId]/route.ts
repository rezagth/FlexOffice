import { NextResponse } from "next/server";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { removePropertyPhoto } from "@/server/domains/properties/photos";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

export const DELETE = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { id, photoId } = await params;
  const { ctx } = await requirePropertyManageAccess(id);
  await removePropertyPhoto(id, photoId, ctx);
  return NextResponse.json({ deleted: true });
});
