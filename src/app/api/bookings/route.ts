import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { requireAuth } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";
import { createBookingSchema } from "@/lib/validation/bookings";
import { createBooking } from "@/server/domains/bookings/create-booking";

// GET /api/bookings — Auth: required (CLIENT). Returns only the caller's
// own bookings, scoped by clientUserId from the verified session — never
// from a client-supplied id.
export const GET = withErrorHandling(async () => {
  const ctx = await requireAuth();
  const bookings = await prisma.booking.findMany({
    where: { clientUserId: ctx.userId },
    include: { space: { select: { name: true, slug: true } } },
    orderBy: { startsAt: "desc" },
  });
  return NextResponse.json({ bookings });
});

// POST /api/bookings — Auth: required. Creates a PENDING request plus an
// authorized (uncaptured) payment. The body carries intent only: any
// price, duration or raw time range in it is ignored, since the amount is
// always recomputed server-side from the space (see create-booking.ts).
export const POST = withErrorHandling(async (request: Request) => {
  const ctx = await requireAuth();
  const input = createBookingSchema.parse(await request.json());
  const booking = await createBooking(ctx.userId, input);
  return NextResponse.json({ booking }, { status: 201 });
});
