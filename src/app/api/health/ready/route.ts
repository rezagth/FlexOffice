import { readinessResponse } from "../readiness";

// GET /api/health/ready — 200 when PostgreSQL and Supabase Auth answer,
// 503 otherwise. Used by the deploy smoke test and uptime monitoring.
// See ../readiness.ts.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return readinessResponse(request);
}
