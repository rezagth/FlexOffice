import { NextResponse } from "next/server";
import { completeProfileSchema } from "@/lib/validation/signup-wizard";
import { requireAuth } from "@/server/auth/rbac";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { ACCOUNT_RATE_LIMITS } from "@/server/domains/users/auth-limits";
import { completeExistingProfile } from "@/server/domains/users/complete-profile";
import { withErrorHandling } from "@/server/lib/http";

// PATCH /api/account/complete-profile
// Auth: requireAuth — always the caller's own profile (ctx.userId).
// Body: CompleteProfileInput (need, holderType, phone, + company fields when
// holderType is COMPANY) — PRD V1.1 R15/R62.
export const PATCH = withErrorHandling(async (request: Request) => {
  const ctx = await requireAuth();
  await enforceRateLimit({
    key: `account:complete-profile:user:${ctx.userId}`,
    config: ACCOUNT_RATE_LIMITS.profileUpdate,
    endpoint: "PATCH /api/account/complete-profile",
    scope: "user",
  });

  const input = completeProfileSchema.parse(await request.json().catch(() => null));
  const outcome = await completeExistingProfile(ctx.userId, input);
  return NextResponse.json(outcome);
});
