import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { requireAuth } from "@/server/auth/rbac";
import { withErrorHandling } from "@/server/lib/http";

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

// POST /api/bookings — the reservation tunnel (slot check against the
// database exclusion constraint, payment authorization, confirmation) is
// scaffolded for a following iteration. Returning 501 rather than a fake
// 200 keeps the contract honest for anything calling this early.
export const POST = withErrorHandling(async () => {
  await requireAuth();
  return NextResponse.json(
    {
      error: {
        code: "NOT_IMPLEMENTED",
        message: "La création de réservation arrive dans une prochaine itération.",
      },
    },
    { status: 501 }
  );
});
