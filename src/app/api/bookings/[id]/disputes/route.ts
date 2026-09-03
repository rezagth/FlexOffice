import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/rbac";
import { raiseDisputeSchema } from "@/lib/validation/disputes";
import { raiseDispute } from "@/server/domains/disputes/raise";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/bookings/[id]/disputes — signals an issue with a booking.
// Either the client who made it or the landlord organization it belongs to
// may raise one; a booking outside both returns 404 (see raise.ts).
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const ctx = await requireAuth();
  const { id } = await params;
  const input = raiseDisputeSchema.parse(await request.json());

  const dispute = await raiseDispute({
    bookingId: id,
    actorUserId: ctx.userId,
    activeOrgId: ctx.activeOrgId ?? null,
    description: input.description,
  });

  return NextResponse.json({ id: dispute.id, status: dispute.status }, { status: 201 });
});
