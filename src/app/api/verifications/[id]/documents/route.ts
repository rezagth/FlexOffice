import { NextResponse } from "next/server";
import { verificationDocumentTypeSchema } from "@/lib/validation/verification";
import {
  getClientIp,
  logRateLimitDenied,
  rateLimit,
  RATE_LIMITS,
} from "@/server/auth/rate-limit";
import { requireVerificationOwnerAccess } from "@/server/domains/verification/access";
import { uploadVerificationDocument } from "@/server/domains/verification/documents";
import { RateLimitedError, ValidationError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/verifications/[id]/documents — multipart upload of one document.
// Auth: required, caller must hold landlord:manage_verification for the
//   dossier's own organization.
// Body: multipart/form-data with `file` and `type`
//   (one of VerificationDocumentType).
//
// Ownership, file-type sniffing, size and the storage path are all decided
// server-side, never by the caller — see domains/verification/documents.ts
// and storage.ts. `type` is validated against the enum here; everything else
// about whether the FILE actually matches that claim is the domain
// function's job.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const { id } = await params;
  const { ctx, verification } = await requireVerificationOwnerAccess(id);

  const { ip, trusted } = getClientIp(request);
  const verdict = await rateLimit(
    `verification:upload:ip:${ip}`,
    RATE_LIMITS.verificationDocumentUpload
  );
  if (!verdict.allowed) {
    logRateLimitDenied({
      endpoint: "POST /api/verifications/[id]/documents",
      scope: "ip",
      retryAfterSeconds: verdict.retryAfterSeconds,
      ipTrusted: trusted,
    });
    throw new RateLimitedError("Trop de tentatives. Réessayez plus tard.", verdict.retryAfterSeconds);
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new ValidationError("Aucun fichier reçu.");
  }
  const declaredType = verificationDocumentTypeSchema.parse(formData.get("type"));

  const document = await uploadVerificationDocument({
    verification,
    uploadedByProfileId: ctx.userId,
    organizationId: verification.organizationId,
    declaredType,
    file,
  });

  return NextResponse.json(document, { status: 201 });
});
