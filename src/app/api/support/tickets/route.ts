import { NextResponse } from "next/server";
import { createTicketSchema } from "@/lib/validation/support";
import { createTicket } from "@/server/domains/support/tickets";
import { getAuthContext } from "@/server/auth/rbac";
import { getClientIp, logRateLimitDenied, rateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { RateLimitedError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/http";

// POST /api/support/tickets — "Nous contacter". Public: a visitor blocked
//   before signing up still needs a channel (see tickets.ts). Rate-limited
//   like any other public write that reaches the database with no session.
export const POST = withErrorHandling(async (request: Request) => {
  const { ip, trusted } = getClientIp(request);
  const verdict = await rateLimit(`support:ticket:ip:${ip}`, RATE_LIMITS.supportTicket);
  if (!verdict.allowed) {
    logRateLimitDenied({
      endpoint: "POST /api/support/tickets",
      scope: "ip",
      retryAfterSeconds: verdict.retryAfterSeconds,
      ipTrusted: trusted,
    });
    throw new RateLimitedError(
      "Trop de messages envoyés. Réessayez plus tard.",
      verdict.retryAfterSeconds
    );
  }

  const input = createTicketSchema.parse(await request.json());
  // Best-effort: an unauthenticated or misconfigured session must not block
  // a visitor from reaching support — the ticket is valid with userId null.
  const ctx = await getAuthContext().catch(() => null);

  const ticket = await createTicket(input, ctx?.userId ?? null);
  return NextResponse.json({ id: ticket.id }, { status: 201 });
});
