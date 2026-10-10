import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { getClientIp, rateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { isDemoModeRequested } from "@/server/auth/runtime-config";
import { logError } from "@/server/lib/logger";

/**
 * Readiness: can this instance serve a real request right now?
 *
 * Checks the two dependencies every signed-in page needs — PostgreSQL and
 * Supabase Auth (GoTrue) — and answers 503 if either is down, so the deploy
 * smoke test and an uptime monitor see the outage. It is NOT the container
 * healthcheck: that is /api/health/live, which must never depend on another
 * service (a database incident would otherwise get every healthy container
 * restarted in a loop, turning a degradation into an outage).
 *
 * The body names each dependency and its state, nothing more: no host, no
 * version, no error message. Details go to the logs.
 */

export const AUTH_HEALTH_TIMEOUT_MS = 2000;

export type DependencyState = "reachable" | "unreachable" | "skipped" | "not_configured";

export type ReadinessReport = {
  status: "ok" | "error";
  database: DependencyState;
  auth: DependencyState;
};

function env(name: string): string | undefined {
  // "" means "not configured" (see runtime-config.ts).
  return process.env[name] || undefined;
}

/**
 * A missing dependency is acceptable in demo mode and in local development
 * (the demo-mode contract); in a real production deployment it is a failure.
 */
function unconfiguredState(): DependencyState {
  if (isDemoModeRequested() || process.env.NODE_ENV !== "production") return "skipped";
  return "not_configured";
}

async function checkDatabase(): Promise<DependencyState> {
  if (!env("DATABASE_URL")) return unconfiguredState();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "reachable";
  } catch (error) {
    logError({ event: "health.database_unreachable", error });
    return "unreachable";
  }
}

async function checkAuth(): Promise<DependencyState> {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return unconfiguredState();
  try {
    // Kong requires the publishable key on /auth/v1/*, health included.
    const response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/health`, {
      headers: { apikey: anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_HEALTH_TIMEOUT_MS),
    });
    if (response.ok) return "reachable";
    logError({
      event: "health.auth_unreachable",
      error: new Error(`GoTrue health answered HTTP ${response.status}`),
    });
    return "unreachable";
  } catch (error) {
    logError({ event: "health.auth_unreachable", error });
    return "unreachable";
  }
}

export async function checkReadiness(): Promise<ReadinessReport> {
  const [database, auth] = await Promise.all([checkDatabase(), checkAuth()]);
  const healthy = (state: DependencyState) => state === "reachable" || state === "skipped";
  return {
    status: healthy(database) && healthy(auth) ? "ok" : "error",
    database,
    auth,
  };
}

/**
 * GET handler shared by /api/health/ready and the legacy /api/health.
 *
 * Rate-limited because it is unauthenticated and opens a database connection
 * and an outbound request: without a limit it is a free way to exhaust the
 * pool. Requests without the trusted client-IP header (Coolify probing the
 * container locally, the deploy smoke test through the internal network)
 * all share the "unknown" key and are not limited — limiting that shared
 * bucket would let anyone reaching the proxy without going through Cloudflare
 * get the instance reported unhealthy. Failures to consult the limiter fall
 * through to "allow" so a monitor never gets a false alarm from the limiter.
 *
 * Deliberately not wrapped in withErrorHandling: a health check answers with
 * its own contract (200 / 503), not the generic error envelope.
 */
export async function readinessResponse(request: Request): Promise<Response> {
  const { ip } = getClientIp(request);
  const verdict =
    ip === "unknown"
      ? { allowed: true, retryAfterSeconds: 0 }
      : await rateLimit(`public:health:ip:${ip}`, RATE_LIMITS.publicRead, {
          onStoreError: "allow",
        });
  if (!verdict.allowed) {
    return NextResponse.json(
      { status: "error", reason: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } }
    );
  }

  const report = await checkReadiness();
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
