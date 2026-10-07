import { NextResponse } from "next/server";
import { withErrorHandling } from "@/server/lib/http";
import { requireOrgCapability } from "@/server/domains/organizations/require-org-capability";
import { rejectBookingRequest } from "@/server/domains/bookings/accept-reject";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/partner/bookings/[id]/reject — releases the authorization,
// freeing the slot. Same 404/409 semantics as accept.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireOrgCapability("landlord:manage_bookings");
  const { id } = await params;
  const result = await rejectBookingRequest(ctx.organizationId, id);
  return NextResponse.json(result);
});
