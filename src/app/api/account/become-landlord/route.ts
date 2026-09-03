import { NextResponse } from "next/server";
import { becomeLandlordSchema } from "@/lib/validation/landlord";
import {
  getClientIp,
  logRateLimitDenied,
  rateLimit,
  RATE_LIMITS,
} from "@/server/auth/rate-limit";
import { requireAuth } from "@/server/auth/rbac";
import { becomeLandlord } from "@/server/domains/organizations/become-landlord";
import { RateLimitedError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

// POST /api/account/become-landlord
// Auth: required. Any authenticated account may open a letting activity —
//   that is the point of the single account.
// Body: BecomeLandlordInput (see src/lib/validation/landlord.ts)
// Rate limit: 5 / hour / IP — creates an organization, so not free to loop.
//
// The caller is always the actor: there is no `userId` in the payload. An
// administrator opening an activity for someone else is a back-office action
// with its own audit requirements, not this endpoint.
export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requireAuth();

  const { ip, trusted } = getClientIp(request);
  const verdict = await rateLimit(
    `account:become-landlord:ip:${ip}`,
    RATE_LIMITS.becomeLandlord
  );
  if (!verdict.allowed) {
    logRateLimitDenied({
      endpoint: "POST /api/account/become-landlord",
      scope: "ip",
      retryAfterSeconds: verdict.retryAfterSeconds,
      ipTrusted: trusted,
    });
    throw new RateLimitedError(
      "Trop de tentatives. Réessayez plus tard.",
      verdict.retryAfterSeconds
    );
  }

  const body = await request.json().catch(() => null);
  const input = becomeLandlordSchema.parse(body);

  const organization = await becomeLandlord({ actor: ctx, input });

  return NextResponse.json(
    {
      organizationId: organization.id,
      organizationName: organization.name,
      holderType: organization.holderType,
      status: organization.status,
    },
    { status: 201 }
  );
});
