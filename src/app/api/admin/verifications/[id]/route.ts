import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/rbac";
import { getVerificationForAdmin } from "@/server/domains/verification/get";
import { NotFoundError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/verifications/[id] — full dossier detail for review:
//   organization, holder type, activity type, documents (metadata, not
//   signed URLs — see the dedicated document route), status history fields,
//   rejection reason.
// Auth: required, platform administration only.
export const GET = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;

  const verification = await getVerificationForAdmin(id);
  if (!verification) throw new NotFoundError("Dossier introuvable");

  return NextResponse.json({ verification });
});
