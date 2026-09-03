import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validation/auth";
import {
  getClientIp,
  logRateLimitDenied,
  rateLimit,
  RATE_LIMITS,
} from "@/server/auth/rate-limit";
import { getAuthRuntimeMode } from "@/server/auth/runtime-config";
import { registerUser } from "@/server/domains/users/register";
import { RateLimitedError, ServiceUnavailableError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

// POST /api/auth/register
// Auth: none (public signup endpoint)
// Body: RegisterInput (see src/lib/validation/auth.ts) — role-discriminated,
//       CLIENT or PARTNER (+ organization fields)
// Rate limit: 5 / hour / IP
//
// Note the Zod union below is not the security boundary for the role: an
// attacker can POST to Supabase's own /auth/v1/signup and never reach this
// file. The role whitelist lives in the `handle_new_user` trigger (migration
// 20260830120000_harden_signup_role_whitelist), which is on every path.
export const POST = withErrorHandling(async (request: Request) => {
  const mode = getAuthRuntimeMode();
  if (mode !== "READY") {
    throw new ServiceUnavailableError("L'inscription n'est pas configurée.");
  }

  const { ip, trusted } = getClientIp(request);
  const verdict = await rateLimit(`auth:register:ip:${ip}`, RATE_LIMITS.authRegister);
  if (!verdict.allowed) {
    logRateLimitDenied({
      endpoint: "POST /api/auth/register",
      scope: "ip",
      retryAfterSeconds: verdict.retryAfterSeconds,
      ipTrusted: trusted,
    });
    throw new RateLimitedError(
      "Trop de tentatives d'inscription. Réessayez plus tard.",
      verdict.retryAfterSeconds
    );
  }

  const body = await request.json();
  const input = registerSchema.parse(body);

  const result = await registerUser(input);

  return NextResponse.json(
    {
      userId: result.userId,
      emailConfirmationRequired: result.emailConfirmationRequired,
    },
    { status: 201 }
  );
});
