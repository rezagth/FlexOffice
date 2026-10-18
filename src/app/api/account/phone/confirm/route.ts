import { NextResponse } from "next/server";
import { confirmPhoneCodeSchema } from "@/lib/validation/phone-verification";
import { requireAuth } from "@/server/auth/rbac";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { ACCOUNT_RATE_LIMITS } from "@/server/domains/users/auth-limits";
import { confirmPhoneVerificationCode } from "@/server/domains/users/phone-verification";
import { withErrorHandling } from "@/server/lib/http";

// POST /api/account/phone/confirm
// Auth: requireAuth — always the caller's own profile.
// Body: { code } — the 5-attempt and single-use limits live on the code row
// itself (phone-verification.ts); this rate limit is just a looser outer
// guard against a scripted hammer on the endpoint.
export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requireAuth();
  await enforceRateLimit({
    key: `account:phone-confirm:user:${ctx.userId}`,
    config: ACCOUNT_RATE_LIMITS.profileUpdate,
    endpoint: "POST /api/account/phone/confirm",
    scope: "user",
  });

  const { code } = confirmPhoneCodeSchema.parse(await request.json().catch(() => null));
  const result = await confirmPhoneVerificationCode(ctx.userId, code);
  return NextResponse.json(result);
});
