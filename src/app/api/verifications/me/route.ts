import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/rbac";
import { getOwnVerification } from "@/server/domains/verification/get";
import { withErrorHandling } from "@/server/lib/http";

// GET /api/verifications/me
// Auth: required. Scoped by the caller's OWN active membership — never a
//   client-supplied organization or verification id.
// Returns null (as `{ verification: null }`) for an account with no landlord
//   organization, rather than a 404 — "you have no dossier yet" is an
//   ordinary answer, not an error.
export const GET = withErrorHandling(async () => {
  const ctx = await requireAuth();
  const verification = await getOwnVerification(ctx.userId);
  return NextResponse.json({ verification });
});
