import { NextResponse } from "next/server";
import { requestPhoneCodeSchema } from "@/lib/validation/phone-verification";
import { requireAuth } from "@/server/auth/rbac";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { ACCOUNT_RATE_LIMITS } from "@/server/domains/users/auth-limits";
import { requestPhoneVerificationCode } from "@/server/domains/users/phone-verification";
import { withErrorHandling } from "@/server/lib/http";

// POST /api/account/phone/request-code
// Auth: requireAuth — always the caller's own profile.
// Body: { newPhone } — PRD V1.1 2B, R25-R30/R51. 3 per hour per account.
export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requireAuth();
  await enforceRateLimit({
    key: `account:phone-request:user:${ctx.userId}`,
    config: ACCOUNT_RATE_LIMITS.phoneCodeRequest,
    endpoint: "POST /api/account/phone/request-code",
    scope: "user",
  });

  const { newPhone } = requestPhoneCodeSchema.parse(await request.json().catch(() => null));
  const result = await requestPhoneVerificationCode(ctx.userId, newPhone);
  return NextResponse.json(result);
});
