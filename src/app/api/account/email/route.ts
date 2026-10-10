import { NextResponse } from "next/server";
import { changeEmailSchema } from "@/lib/validation/auth";
import { requireAuth } from "@/server/auth/rbac";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { ACCOUNT_RATE_LIMITS } from "@/server/domains/users/auth-limits";
import { requestEmailChange } from "@/server/domains/users/profile";
import { withErrorHandling } from "@/server/lib/http";
import { getAppBaseUrl } from "@/server/lib/request-origin";

// POST /api/account/email
// Auth: requireAuth. Body: { email } — the NEW address.
// Response: 202 { message } — the same whether or not the address is free.
// Rate limit: 5 / hour / account (each request sends e-mails).
export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requireAuth();
  await enforceRateLimit({
    key: `account:email:user:${ctx.userId}`,
    config: ACCOUNT_RATE_LIMITS.emailChange,
    endpoint: "POST /api/account/email",
    scope: "user",
  });

  const input = changeEmailSchema.parse(await request.json().catch(() => null));
  const result = await requestEmailChange({
    userId: ctx.userId,
    currentEmail: ctx.email,
    newEmail: input.email,
    appBaseUrl: getAppBaseUrl(request),
  });
  return NextResponse.json(result, { status: 202 });
});
