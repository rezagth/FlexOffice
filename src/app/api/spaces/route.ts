import { NextResponse } from "next/server";
import { listPublishedSpaces } from "@/server/domains/spaces/list-spaces";
import { withErrorHandling } from "@/server/lib/http";

// GET /api/spaces?city=Paris
// Auth: none (public listing search)
// Output: published spaces only, city substring match — scaffolded for
// this iteration; capacity/date/amenities filters are a follow-up.
export const GET = withErrorHandling(async (request: Request) => {
  const url = new URL(request.url);
  const city = url.searchParams.get("city") ?? undefined;
  const spaces = await listPublishedSpaces({ city });
  return NextResponse.json({ spaces });
});
