import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validation/auth";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/server/auth/rate-limit";
import { registerUser } from "@/server/domains/users/register";
import { RateLimitedError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

// POST /api/auth/register
// Auth: none (public signup endpoint)
// Body: RegisterInput (see src/lib/validation/auth.ts) — role-discriminated,
//       CLIENT or PARTNER (+ organization fields)
// Rate limit: 5 / hour / IP
export const POST = withErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`auth:register:${ip}`, RATE_LIMITS.authRegister)) {
    throw new RateLimitedError();
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
