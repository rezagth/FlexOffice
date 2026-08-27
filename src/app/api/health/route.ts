import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

// GET /api/health — liveness + DB readiness. No auth (used by uptime
// monitors / load balancers). Exposes no infrastructure detail beyond
// "database reachable or not".
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "reachable" });
  } catch {
    return NextResponse.json(
      { status: "error", database: "unreachable" },
      { status: 503 }
    );
  }
}
