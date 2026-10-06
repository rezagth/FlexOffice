import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/rbac";
import { enforceRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { cancelBookingAsClient } from "@/server/domains/bookings/cancel";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/bookings/[id]/cancel — the client cancels their own booking.
// Auth: required; scoped by clientUserId from the session (another client's
// booking is a 404). The refund follows src/lib/cancellation-policy.ts and is
// computed server-side from the booking — the request carries no amount.
export const POST = withErrorHandling(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireAuth();
  await enforceRateLimit({
    key: `booking:cancel:user:${ctx.userId}`,
    config: RATE_LIMITS.bookingCancel,
    endpoint: "POST /api/bookings/[id]/cancel",
    scope: "user",
    onStoreError: "allow",
  });
  const { id } = await params;
  const result = await cancelBookingAsClient(ctx.userId, id);
  return NextResponse.json(result);
});
