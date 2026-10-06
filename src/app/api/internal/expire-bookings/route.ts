import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { withErrorHandling } from "@/server/lib/http";
import { UnauthorizedError } from "@/server/lib/errors";
import { runBookingMaintenance } from "@/server/domains/bookings/expire-stale";

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
//
// Booking maintenance, meant to run every 15 minutes (a Coolify scheduled
// task: `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET"
// http://localhost:3000/api/internal/expire-bookings`):
//   1. release abandoned card steps (AWAITING_PAYMENT older than 15 min);
//   2. expire unanswered requests (48 h, or the start of the slot);
//   3. mark finished bookings COMPLETED.
export const POST = withErrorHandling(async (request: Request) => {
  if (!isAuthorized(request)) throw new UnauthorizedError();
  const result = await runBookingMaintenance();
  return NextResponse.json(result);
});
