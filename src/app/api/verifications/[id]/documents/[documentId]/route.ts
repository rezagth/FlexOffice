import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { requireVerificationOwnerAccess } from "@/server/domains/verification/access";
import { deleteVerificationDocument } from "@/server/domains/verification/documents";
import { createSignedDocumentUrl } from "@/server/domains/verification/storage";
import { NotFoundError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string; documentId: string }> };

// GET /api/verifications/[id]/documents/[documentId] — a short-lived signed
//   URL to view the document, never the storage path itself. Cas 8: the
//   path alone grants nothing (the bucket is fully private), and reaching
//   this route at all requires the same organization-membership check every
//   other verification route enforces.
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { id, documentId } = await params;
  await requireVerificationOwnerAccess(id);

  const document = await prisma.verificationDocument.findFirst({
    where: { id: documentId, verificationId: id },
  });
  if (!document) throw new NotFoundError("Document introuvable");

  const signedUrl = await createSignedDocumentUrl(document.storagePath);
  return NextResponse.json({ signedUrl });
});

// DELETE /api/verifications/[id]/documents/[documentId]
export const DELETE = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { id, documentId } = await params;
  const { ctx, verification } = await requireVerificationOwnerAccess(id);

  await deleteVerificationDocument({
    verification,
    documentId,
    actorProfileId: ctx.userId,
    organizationId: verification.organizationId,
  });

  return NextResponse.json({ status: "deleted" });
});
