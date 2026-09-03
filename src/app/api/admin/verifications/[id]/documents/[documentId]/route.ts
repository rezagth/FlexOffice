import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { requireAdmin } from "@/server/auth/rbac";
import { createSignedDocumentUrl } from "@/server/domains/verification/storage";
import { NotFoundError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string; documentId: string }> };

// GET /api/admin/verifications/[id]/documents/[documentId] — a short-lived
//   signed URL for the reviewer to view one document.
// Auth: required, platform administration only. Read-only: admins review
//   evidence here, they do not upload or delete it (that stays with the
//   organization's own OWNER/ADMIN, via /api/verifications/*).
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id, documentId } = await params;

  const document = await prisma.verificationDocument.findFirst({
    where: { id: documentId, verificationId: id },
  });
  if (!document) throw new NotFoundError("Document introuvable");

  const signedUrl = await createSignedDocumentUrl(document.storagePath);
  return NextResponse.json({ signedUrl });
});
