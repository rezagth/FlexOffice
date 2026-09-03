import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { getClientIp, rateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { logError } from "@/server/lib/logger";

// GET /api/health — liveness + DB readiness. No auth (used by uptime monitors
// and load balancers). Exposes no infrastructure detail beyond "database
// reachable or not".
//
// Rate-limited because it is unauthenticated and opens a database connection:
// without a limit it is a free way to exhaust the connection pool. The limit
// is generous enough for any sane monitoring interval, and failures to
// consult the limiter fall through to "allow" so a monitor never gets a false
// alarm from the limiter itself.
//
// Deliberately not wrapped in withErrorHandling: a health check must answer
// with its own contract (200 / 503), not the generic error envelope.
export async function GET(request: Request) {
  const { ip } = getClientIp(request);
  const verdict = await rateLimit(`public:health:ip:${ip}`, RATE_LIMITS.publicRead, {
    onStoreError: "allow",
  });
  if (!verdict.allowed) {
    return NextResponse.json(
      { status: "error", reason: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } }
    );
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "reachable" });
  } catch (error) {
    // Logged so a failing health check leaves a diagnosable trace instead of
    // only a red dot on a dashboard. The response body stays opaque.
    logError({ event: "health.database_unreachable", error });
    return NextResponse.json(
      { status: "error", database: "unreachable" },
      { status: 503 }
    );
  }
}
