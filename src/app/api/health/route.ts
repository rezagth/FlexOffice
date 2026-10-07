import { readinessResponse } from "./readiness";

// GET /api/health — kept for monitors configured before the live/ready split.
// Alias of /api/health/ready (same checks, same 200/503 contract, and still
// reports `database`). New probes should use:
//   /api/health/live   container healthcheck, no dependency
//   /api/health/ready  dependencies (database + Supabase Auth)
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return readinessResponse(request);
}
