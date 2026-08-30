import { NextResponse } from "next/server";
import { requireOrg } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { ValidationError } from "@/server/lib/errors";
import { addSpacePhoto, removeSpacePhoto } from "@/server/domains/organizations/photos";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/partner/spaces/[id]/photos — multipart upload of one image.
// Ownership, MIME type, size and the storage path are all decided here,
// never by the caller (see domains/organizations/photos.ts).
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireOrg();
  const { id } = await params;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new ValidationError("Aucun fichier reçu.");
  }

  const result = await addSpacePhoto(ctx.organizationId, id, file);
  return NextResponse.json(result, { status: 201 });
});

// DELETE /api/partner/spaces/[id]/photos?url=…
export const DELETE = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireOrg();
  const { id } = await params;

  const url = new URL(request.url).searchParams.get("url");
  if (!url) throw new ValidationError("Paramètre url manquant.");

  const result = await removeSpacePhoto(ctx.organizationId, id, url);
  return NextResponse.json(result);
});
