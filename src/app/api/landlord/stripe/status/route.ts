import { NextResponse } from "next/server";
import { requireCapability } from "@/server/auth/rbac";
import { getAccountStatus } from "@/server/domains/payments/stripe-connect";
import { withErrorHandling } from "@/server/lib/http";
import { ForbiddenError } from "@/server/lib/errors";

// GET /api/landlord/stripe/status — current Connect status for the
//   caller's active organization, read live from Stripe.
export const GET = withErrorHandling(async () => {
  const ctx = await requireCapability("landlord:manage_organization");
  if (!ctx.activeOrgId) {
    throw new ForbiddenError("Aucune organisation active pour ce compte.");
  }
  const status = await getAccountStatus(ctx.activeOrgId);
  return NextResponse.json(status);
});
