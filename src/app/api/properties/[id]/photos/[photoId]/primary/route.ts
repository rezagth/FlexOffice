import { NextResponse } from "next/server";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { setPrimaryPropertyPhoto } from "@/server/domains/properties/photos";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { id, photoId } = await params;
  const { ctx } = await requirePropertyManageAccess(id);
  await setPrimaryPropertyPhoto(id, photoId, ctx);
  return NextResponse.json({ ok: true });
});
