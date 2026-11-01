import { NextResponse } from "next/server";
import { createReportSchema } from "@/lib/validation/reports";
import { createContentReport } from "@/server/domains/reports/reports";
import { getAuthContext } from "@/server/auth/rbac";
import { getClientIp, logRateLimitDenied, rateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { RateLimitedError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

type Ctx = { params: Promise<{ slug: string }> };

// POST /api/spaces/[slug]/report — report a listing. Public (a visitor who
// sees an unlawful listing must be able to flag it without an account), so
// rate-limited per IP like any other unauthenticated write.
export const POST = withErrorHandling(async (request: Request, { params }: Ctx) => {
  const { ip, trusted } = getClientIp(request);
  const verdict = await rateLimit(`space:report:ip:${ip}`, RATE_LIMITS.contentReport);
  if (!verdict.allowed) {
    logRateLimitDenied({
      endpoint: "POST /api/spaces/[slug]/report",
      scope: "ip",
      retryAfterSeconds: verdict.retryAfterSeconds,
      ipTrusted: trusted,
    });
    throw new RateLimitedError("Trop de signalements envoyés. Réessayez plus tard.", verdict.retryAfterSeconds);
  }

  const { slug } = await params;
  const input = createReportSchema.parse(await request.json().catch(() => null));
  const ctx = await getAuthContext().catch(() => null);
  const report = await createContentReport(slug, input, ctx?.userId ?? null);
  return NextResponse.json({ id: report.id }, { status: 201 });
});
