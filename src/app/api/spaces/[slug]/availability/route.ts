import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { withErrorHandling } from "@/server/lib/http";
import { NotFoundError, RateLimitedError, ValidationError } from "@/server/lib/errors";
import { checkRateLimit, getClientIp } from "@/server/auth/rate-limit";
import { computeDaySlots } from "@/server/domains/bookings/availability";

type Ctx = { params: Promise<{ slug: string }> };

// Public and unauthenticated but DB-backed, so it is throttled per client.
const AVAILABILITY_LIMIT = { capacity: 60, refillPerSecond: 1 };

// GET /api/spaces/[slug]/availability?date=YYYY-MM-DD
// Auth: none (the booking funnel shows slots before sign-in). Returns
// bookable slots for one day of a published space.
export const GET = withErrorHandling(async (request: Request, { params }: Ctx) => {
  if (!checkRateLimit(`availability:${getClientIp(request)}`, AVAILABILITY_LIMIT)) {
    throw new RateLimitedError();
  }

  const { slug } = await params;
  const date = new URL(request.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError("Paramètre date attendu au format YYYY-MM-DD");
  }

  const space = await prisma.space.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!space) throw new NotFoundError("Space not found");

  const slots = await computeDaySlots(space.id, date);
  if (!slots) {
    return NextResponse.json({ date, closed: true, slots: null });
  }

  return NextResponse.json({ date, closed: false, slots });
});
