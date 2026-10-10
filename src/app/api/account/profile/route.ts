import { NextResponse } from "next/server";
import { updateProfileSchema } from "@/lib/validation/auth";
import { requireAuth } from "@/server/auth/rbac";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { ACCOUNT_RATE_LIMITS } from "@/server/domains/users/auth-limits";
import { updateOwnProfile } from "@/server/domains/users/profile";
import { withErrorHandling } from "@/server/lib/http";

// PATCH /api/account/profile
// Auth: requireAuth — always the caller's own profile (ctx.userId); any id
// in the body is ignored by the schema.
// Body: { name, phone? } — phone "" or null clears it.
// Rate limit: 30 / hour / account.
export const PATCH = withErrorHandling(async (request: Request) => {
  const ctx = await requireAuth();
  await enforceRateLimit({
    key: `account:profile:user:${ctx.userId}`,
    config: ACCOUNT_RATE_LIMITS.profileUpdate,
    endpoint: "PATCH /api/account/profile",
    scope: "user",
  });

  const input = updateProfileSchema.parse(await request.json().catch(() => null));
  const profile = await updateOwnProfile(ctx.userId, input);
  return NextResponse.json({ profile });
});
