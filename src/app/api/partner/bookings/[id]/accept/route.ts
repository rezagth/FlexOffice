import { NextResponse } from "next/server";
import { requireOrg } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { acceptBookingRequest } from "@/server/domains/bookings/accept-reject";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/partner/bookings/[id]/accept — captures the authorized
// payment. A request belonging to another organization returns 404; one
// already handled returns 409.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireOrg();
  const { id } = await params;
  const result = await acceptBookingRequest(ctx.organizationId, id);
  return NextResponse.json(result);
});
