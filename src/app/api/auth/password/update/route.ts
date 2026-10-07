import { NextResponse } from "next/server";
import { updatePasswordSchema } from "@/lib/validation/auth";
import { requireAuth } from "@/server/auth/rbac";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { ACCOUNT_RATE_LIMITS } from "@/server/domains/users/auth-limits";
import { updatePassword } from "@/server/domains/users/password";
import { withErrorHandling } from "@/server/lib/http";

// POST /api/auth/password/update
// Auth: requireAuth — the account is always the session's, never the body's.
// Body: { password, currentPassword? }
//   - from the "nouveau mot de passe" page (session opened by a reset link):
//     `password` only;
//   - from the account page: `currentPassword` is required and re-verified.
//   See users/password.ts for why a bare session is not enough.
// Rate limit: 5 / 15 min / account (each attempt is also a password guess).
export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requireAuth();
  await enforceRateLimit({
    key: `auth:password-update:user:${ctx.userId}`,
    config: ACCOUNT_RATE_LIMITS.passwordUpdate,
    endpoint: "POST /api/auth/password/update",
    scope: "user",
  });

  const input = updatePasswordSchema.parse(await request.json().catch(() => null));
  await updatePassword({
    userId: ctx.userId,
    email: ctx.email,
    password: input.password,
    currentPassword: input.currentPassword,
  });

  return NextResponse.json({ ok: true });
});
