import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { deleteOrAnonymizeProfile } from "@/server/domains/users/gdpr";

// POST /api/client/gdpr/delete — GDPR right to erasure for the caller's
// own account. Accounts with booking history are anonymized rather than
// deleted (accounting retention) — see domains/users/gdpr.ts.
export const POST = withErrorHandling(async () => {
  const ctx = await requireAuth();
  const result = await deleteOrAnonymizeProfile(ctx.userId);
  return NextResponse.json(result);
});
