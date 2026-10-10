import { NextResponse } from "next/server";
import { requireCapability } from "@/server/auth/rbac";
import { enforceRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { cancelBookingAsLandlord } from "@/server/domains/bookings/cancel";
import { ForbiddenError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/partner/bookings/[id]/cancel — the landlord cancels a confirmed
// booking. Auth: landlord:manage_bookings on the active organization; a
// booking of another organization is a 404. The client is refunded in full.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireCapability("landlord:manage_bookings");
  if (!ctx.activeOrgId) throw new ForbiddenError("Aucune organisation active pour ce compte.");
  await enforceRateLimit({
    key: `booking:cancel:user:${ctx.userId}`,
    config: RATE_LIMITS.bookingCancel,
    endpoint: "POST /api/partner/bookings/[id]/cancel",
    scope: "user",
    onStoreError: "allow",
  });
  const { id } = await params;
  const result = await cancelBookingAsLandlord(ctx.activeOrgId, ctx.userId, id);
  return NextResponse.json(result);
});
