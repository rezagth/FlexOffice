import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { withErrorHandling } from "@/server/lib/http";
import { UnauthorizedError } from "@/server/lib/errors";
import { expireStaleBookingRequests } from "@/server/domains/bookings/expire-stale";

function isAuthorized(request: Request): boolean {
  const configured = process.env.CRON_SECRET;
  if (!configured) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

// POST /api/internal/expire-bookings
// Auth: shared secret (CRON_SECRET), not a user session — this is meant
// to be called by a scheduler, and is a no-op unless the secret is set.
export const POST = withErrorHandling(async (request: Request) => {
  if (!isAuthorized(request)) throw new UnauthorizedError();
  const result = await expireStaleBookingRequests();
  return NextResponse.json(result);
});
