import { NextResponse } from "next/server";
import { withErrorHandling } from "@/server/lib/http";
import {
  NotFoundError,
  RateLimitedError,
  ServiceUnavailableError,
  ValidationError,
} from "@/server/lib/errors";
import {
  getClientIp,
  logRateLimitDenied,
  rateLimit,
  RATE_LIMITS,
} from "@/server/auth/rate-limit";
import { isDatabaseConfigured } from "@/server/auth/runtime-config";
import { getPublishedSpaceBySlug } from "@/server/domains/spaces/list-spaces";
import { computeDaySlots } from "@/server/domains/bookings/availability";

type Ctx = { params: Promise<{ slug: string }> };

// GET /api/spaces/[slug]/availability?date=YYYY-MM-DD
// Auth: none (the booking funnel shows slots before sign-in). Returns
// bookable slots for one day of a published space.
// Rate limit: 60 / min / IP — public, unauthenticated and DB-backed.
export const GET = withErrorHandling(async (request: Request, { params }: Ctx) => {
  // Availability is computed from opening hours, closures and existing
  // bookings, so it cannot be answered from the demo mock data. Without a
  // database this used to surface as a generic 500 ("DATABASE_URL is not
  // set", swallowed by the error envelope). Saying so plainly is both more
  // useful and consistent with the demo-mode contract: degrade honestly
  // rather than crash or fake a slot.
  if (!isDatabaseConfigured()) {
    throw new ServiceUnavailableError(
      "Les disponibilités ne sont pas accessibles sur cette instance de démonstration."
    );
  }

  const { ip, trusted } = getClientIp(request);
  // onStoreError "allow": a public read, not an authentication endpoint.
  // Denying every visitor because a rate-limit backend blinked would turn a
  // hardening measure into an outage of the booking funnel.
  const verdict = await rateLimit(
    `public:availability:ip:${ip}`,
    RATE_LIMITS.publicAvailability,
    { onStoreError: "allow" }
  );
  if (!verdict.allowed) {
    logRateLimitDenied({
      endpoint: "GET /api/spaces/[slug]/availability",
      scope: "ip",
      retryAfterSeconds: verdict.retryAfterSeconds,
      ipTrusted: trusted,
    });
    throw new RateLimitedError("Trop de requêtes.", verdict.retryAfterSeconds);
  }

  const { slug } = await params;
  const date = new URL(request.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError("Paramètre date attendu au format YYYY-MM-DD");
  }

  // Goes through getPublishedSpaceBySlug rather than querying `space` here,
  // so this route applies the same visibility rule as the search and the
  // detail page: PUBLISHED is not enough, the owning organization must also
  // be allowed to publish. Querying directly left a suspended partner's
  // availability readable — and, since the funnel reads it, bookable.
  const space = await getPublishedSpaceBySlug(slug);
  if (!space) throw new NotFoundError("Space not found");

  const slots = await computeDaySlots(space.id, date);
  if (!slots) {
    return NextResponse.json({ date, closed: true, slots: null });
  }

  return NextResponse.json({ date, closed: false, slots });
});
