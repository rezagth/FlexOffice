import { NextResponse } from "next/server";
import {
  getClientIp,
  logRateLimitDenied,
  rateLimit,
  RATE_LIMITS,
} from "@/server/auth/rate-limit";
import { listPublishedSpaces } from "@/server/domains/spaces/list-spaces";
import { RateLimitedError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

// GET /api/spaces?city=Paris&capacity=10&amenities=WIFI&amenities=PARKING&date=2026-09-10
// Auth: none (public listing search)
// Rate limit: 120 / min / IP — unauthenticated and it queries the database, so
//   it is a free amplification point without one.
// Output: published spaces only, from organizations that are not suspended
//   (see list-spaces.ts). City substring, capacity floor, amenities
//   (must have every one requested) and same-day availability.
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
  const city = url.searchParams.get("city") ?? undefined;
  const capacityParam = url.searchParams.get("capacity");
  const capacity =
    capacityParam && Number.isFinite(Number(capacityParam)) && Number(capacityParam) > 0
      ? Math.floor(Number(capacityParam))
      : undefined;
  const amenities = url.searchParams.getAll("amenities");
  const dateParam = url.searchParams.get("date");
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

  const spaces = await listPublishedSpaces({
    city,
    capacity,
    amenities: amenities.length ? amenities : undefined,
    date,
    track: true,
  });
  return NextResponse.json({ spaces });
});
