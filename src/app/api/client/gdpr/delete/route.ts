import { NextResponse } from "next/server";
import { deleteAccountSchema } from "@/lib/validation/auth";
import { requireAuth } from "@/server/auth/rbac";
import { enforceRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { deleteOwnAccount } from "@/server/domains/users/gdpr";
import { withErrorHandling } from "@/server/lib/http";

// POST /api/client/gdpr/delete — GDPR right to erasure for the caller's
// own account.
// Auth: requireAuth, PLUS the current password (re-authentication, SEC-10):
//       a session cookie alone must not be enough to erase an account.
// Body: { password }
// Errors: 403 INVALID_PASSWORD, 409 when a booking is still pending,
//         awaiting payment or confirmed and not finished (FCT-19).
// Rate limit: 3 / hour / account (also caps password guesses here).
// Accounts with history are anonymized rather than deleted (accounting
// retention) — see domains/users/gdpr.ts.
export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requireAuth();
  await enforceRateLimit({
    key: `account:delete:user:${ctx.userId}`,
    config: RATE_LIMITS.accountDeletion,
    endpoint: "POST /api/client/gdpr/delete",
    scope: "user",
    onStoreError: "deny",
  });

  const input = deleteAccountSchema.parse(await request.json().catch(() => null));
  const result = await deleteOwnAccount({ userId: ctx.userId, email: ctx.email, password: input.password });

  // Clear this browser's session cookies. The account is already deleted or
  // banned, so GoTrue may refuse the call itself; the local cookies are
  // removed regardless, which is the part that matters here.
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Best effort — getAuthContext() already rejects an erased account.
  }

  return NextResponse.json(result);
});
