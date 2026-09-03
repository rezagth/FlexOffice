import { NextResponse } from "next/server";
import { requireCapability } from "@/server/auth/rbac";
import { createOnboardingLink } from "@/server/domains/payments/stripe-connect";
import { withErrorHandling } from "@/server/lib/http";
import { ForbiddenError } from "@/server/lib/errors";

// POST /api/landlord/stripe/connect — starts (or resumes) hosted Stripe
//   Connect onboarding for the caller's active organization. OWNER only:
//   this decides where the organization's payouts go.
export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requireCapability("landlord:manage_organization");
  if (!ctx.activeOrgId) {
    throw new ForbiddenError("Aucune organisation active pour ce compte.");
  }

  const origin = new URL(request.url).origin;
  const returnUrl = `${origin}/app/landlord/verification?stripe=return`;
  const refreshUrl = `${origin}/app/landlord/verification?stripe=refresh`;

  const url = await createOnboardingLink(ctx.activeOrgId, returnUrl, refreshUrl);
  return NextResponse.json({ url });
});
