import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { withErrorHandling } from "@/server/lib/http";
import { UnauthorizedError } from "@/server/lib/errors";
import { expirePublishedPromotions } from "@/server/domains/promotions/maintenance";

function isAuthorized(request: Request): boolean {
  const configured = process.env.CRON_SECRET;
  if (!configured) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

// POST /api/internal/expire-promotions
// Auth: shared secret (CRON_SECRET), not a user session — same pattern as
// /api/internal/expire-bookings. Meant to run on a schedule (e.g. hourly):
// `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET"
// http://localhost:3000/api/internal/expire-promotions`.
export const POST = withErrorHandling(async (request: Request) => {
  if (!isAuthorized(request)) throw new UnauthorizedError();
  const result = await expirePublishedPromotions();
  return NextResponse.json(result);
});
