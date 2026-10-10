import { NextResponse } from "next/server";

// GET /api/health/live — liveness. "The Node.js process answers HTTP."
//
// Used by the Docker HEALTHCHECK and Coolify. It must stay this cheap and
// this independent: no database, no Supabase, no rate limiter (whose store
// is itself a network dependency). A liveness probe that touches a
// dependency restarts healthy containers during that dependency's outage.
//
// `version` is the commit the image was built from (APP_VERSION build arg):
// the deploy pipeline polls it to know the new release is the one answering.
// A commit hash is not a secret; nothing else is exposed.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok", version: process.env.APP_VERSION || "dev" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
