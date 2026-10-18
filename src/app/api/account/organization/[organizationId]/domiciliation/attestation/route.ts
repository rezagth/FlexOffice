import { NextResponse } from "next/server";
import { requireDomiciliationOrgAccess } from "@/server/domains/organizations/domiciliation-access";
import {
  getLatestDomiciliationRequest,
  uploadDomiciliationAttestation,
} from "@/server/domains/organizations/domiciliation";
import { createAttestationSignedUrl } from "@/server/domains/organizations/domiciliation-storage";
import { readMultipart, uploadedFile } from "@/server/domains/media/multipart";
import { NotFoundError, ValidationError } from "@/server/lib/errors";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { ACCOUNT_RATE_LIMITS } from "@/server/domains/users/auth-limits";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ organizationId: string }> };

async function latestThirdPartyRequest(organizationId: string) {
  const latest = await getLatestDomiciliationRequest(organizationId);
  if (!latest || latest.kind !== "THIRD_PARTY") {
    throw new NotFoundError("Aucune demande de domiciliation « déjà domicilié ailleurs » en cours.");
  }
  return latest;
}

// POST .../attestation — multipart upload (field "file"), replaces any
// previous attestation in place (deterministic storage path).
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const { organizationId } = await params;
  const ctx = await requireDomiciliationOrgAccess(organizationId);
  await enforceRateLimit({
    key: `account:domiciliation-attestation:org:${organizationId}`,
    config: ACCOUNT_RATE_LIMITS.profileUpdate,
    endpoint: "POST /api/account/organization/[organizationId]/domiciliation/attestation",
    scope: "user",
  });

  const request_ = await latestThirdPartyRequest(organizationId);
  const formData = await readMultipart(request);
  const file = uploadedFile(formData);

  const updated = await uploadDomiciliationAttestation({
    requestId: request_.id,
    organizationId,
    uploadedByProfileId: ctx.userId,
    file,
  });
  return NextResponse.json({
    attestationOriginalFilename: updated.attestationOriginalFilename,
  });
});

// GET .../attestation — a short-lived signed URL to the current attestation.
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const { organizationId } = await params;
  await requireDomiciliationOrgAccess(organizationId);

  const request_ = await latestThirdPartyRequest(organizationId);
  if (!request_.attestationStoragePath) {
    throw new ValidationError("Aucune attestation déposée.");
  }
  const signedUrl = await createAttestationSignedUrl(request_.attestationStoragePath);
  return NextResponse.json({ signedUrl });
});
