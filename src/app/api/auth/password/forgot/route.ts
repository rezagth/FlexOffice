import { NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { accountKey, enforceRateLimit, getClientIp } from "@/server/auth/rate-limit";
import { getAuthRuntimeMode } from "@/server/auth/runtime-config";
import { ACCOUNT_RATE_LIMITS } from "@/server/domains/users/auth-limits";
import { NEUTRAL_FORGOT_MESSAGE, requestPasswordReset } from "@/server/domains/users/password";
import { ServiceUnavailableError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";
import { getAppBaseUrl } from "@/server/lib/request-origin";

// POST /api/auth/password/forgot
// Auth: none
// Body: { email }
// Rate limit: 5 / 15 min / IP  +  3 / hour / address (salted hash)
// Response: 202 with the SAME body whether or not the address has an
//           account, and whether or not the e-mail could be sent (B-15).
//
// The per-address limit counts every address, known or not, so a 429 says
// nothing about existence either. The reset link is built on APP_URL, never
// on the Host header — a forged Host would otherwise mail the victim a link
// to the attacker's domain carrying their recovery token.

export const POST = withErrorHandling(async (request: Request) => {
  if (getAuthRuntimeMode() !== "READY") {
    throw new ServiceUnavailableError("L'authentification n'est pas configurée.");
  }

  const { ip, trusted } = getClientIp(request);
  await enforceRateLimit({
    key: `auth:password-forgot:ip:${ip}`,
    config: ACCOUNT_RATE_LIMITS.passwordForgotPerIp,
    endpoint: "POST /api/auth/password/forgot",
    scope: "ip",
    ipTrusted: trusted,
  });

  const input = forgotPasswordSchema.parse(await request.json().catch(() => null));

  await enforceRateLimit({
    key: `auth:password-forgot:account:${await accountKey(input.email)}`,
    config: ACCOUNT_RATE_LIMITS.passwordForgotPerAccount,
    endpoint: "POST /api/auth/password/forgot",
    scope: "ip",
    ipTrusted: trusted,
  });

  await requestPasswordReset(input.email, getAppBaseUrl(request));

  return NextResponse.json({ message: NEUTRAL_FORGOT_MESSAGE }, { status: 202 });
});
