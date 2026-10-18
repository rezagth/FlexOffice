import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";
import { createAttestationSignedUrl } from "@/server/domains/organizations/domiciliation-storage";
import { recordAudit } from "@/server/lib/audit";
import { NotFoundError, ValidationError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/domiciliations/[id]/attestation — a short-lived signed URL,
// same pattern as the verification document viewer: viewing is audited
// before the URL is ever minted.
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAdmin();
  const { id } = await params;

  const request = await prisma.domiciliationRequest.findUnique({ where: { id } });
  if (!request) throw new NotFoundError("Demande introuvable");
  if (!request.attestationStoragePath) throw new ValidationError("Aucune attestation déposée.");

  await recordAudit({
    event: "domiciliation.attestation_viewed",
    actorUserId: ctx.userId,
    organizationId: request.organizationId,
    metadata: { requestId: id },
  });

  const signedUrl = await createAttestationSignedUrl(request.attestationStoragePath);
  return NextResponse.json({ signedUrl });
});
