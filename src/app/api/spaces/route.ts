import { NextResponse } from "next/server";
import {
  getClientIp,
  logRateLimitDenied,
  rateLimit,
  RATE_LIMITS,
} from "@/server/auth/rate-limit";
import { searchPublishedSpaces } from "@/server/domains/spaces/list-spaces";
import { parseSpaceSearchParams, searchParamsToRecord } from "@/lib/validation/search";
import { RateLimitedError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

// GET /api/spaces?city=Paris&capacity=10&amenities=WIFI&amenities=PARKING&date=2026-09-10
//     &type=MEETING_ROOM&maxPrice=300&sort=price_asc&page=2&limit=24&lat=48.85&lng=2.35
// Auth: none (public listing search)
// Rate limit: 120 / min / IP — unauthenticated and it queries the database, so
//   it is a free amplification point without one.
// Output: published spaces only, from organizations that are not suspended
//   (see list-spaces.ts). City substring, capacity floor, amenities
//   (must have every one requested), space type, maximum full-day price in
//   euros, same-day availability, sort (relevance | price_asc | price_desc)
//   and pagination (24 per page by default, 50 max). Malformed parameters are
//   ignored rather than rejected (lib/validation/search.ts).
//   `{ spaces, pagination: { page, pageSize, total, pageCount } }` — each
//   space carries only the public allow-list of columns.
export const GET = withErrorHandling(async (request: Request) => {
  const { ip, trusted } = getClientIp(request);
  // onStoreError "allow": this is a public read, not an authentication
  // endpoint. Denying every visitor because a rate-limit backend blinked
  // would turn a hardening measure into an outage, and the downside of a
  // brief unlimited window here is load, not compromise.
  const verdict = await rateLimit(`public:spaces:ip:${ip}`, RATE_LIMITS.publicRead, {
    onStoreError: "allow",
  });
  if (!verdict.allowed) {
    logRateLimitDenied({
      endpoint: "GET /api/spaces",
      scope: "ip",
      retryAfterSeconds: verdict.retryAfterSeconds,
      ipTrusted: trusted,
    });
    throw new RateLimitedError("Trop de requêtes.", verdict.retryAfterSeconds);
  }

  const url = new URL(request.url);
  const search = parseSpaceSearchParams(searchParamsToRecord(url.searchParams));

  const result = await searchPublishedSpaces({ ...search, track: true });
  return NextResponse.json({
    spaces: result.spaces,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      pageCount: result.pageCount,
    },
  });
});
