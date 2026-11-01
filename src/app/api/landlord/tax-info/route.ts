import { NextResponse } from "next/server";
import { taxInfoSchema } from "@/lib/validation/tax-info";
import { requireOrgCapability } from "@/server/domains/organizations/require-org-capability";
import { saveTaxInfo } from "@/server/domains/organizations/tax-info";
import { withErrorHandling } from "@/server/lib/http";

// PATCH /api/landlord/tax-info — tax identity of the active organization
// (DAC7), required before the first payout. Organization owners only.
export const PATCH = withErrorHandling(async (request: Request) => {
  const ctx = await requireOrgCapability("landlord:manage_organization");
  const input = taxInfoSchema.parse(await request.json().catch(() => null));
  await saveTaxInfo(ctx.organizationId, ctx.userId, input);
  return NextResponse.json({ saved: true });
});
