import { getClientIp, rateLimit } from "@/server/auth/rate-limit";
import { logError } from "@/server/lib/logger";
import { envelopeEndpoint, parseDsn } from "@/sentry.shared";

/**
 * POST /monitoring — first-party tunnel for browser error reports.
 *
 * The Sentry SDK's own `tunnelRoute` only rewrites to sentry.io, not to a
 * self-hosted GlitchTip, so the tunnel is this route. The browser posts its
 * envelope here (same origin: no CORS, no CSP exception, no ad blocker) and
 * the server forwards it to GlitchTip.
 *
 * It must not become an open relay: the envelope header names its DSN, and
 * anything not addressed to OUR project is refused. Bodies are capped and
 * callers are rate limited per client IP. The client's IP is not forwarded
 * (sendDefaultPii is off, and GlitchTip does not need it).
 *
 * Outside /api/ on purpose: the CSRF origin guard only applies under /api/,
 * and the SDK posts `text/plain`, which that guard rightly refuses there.
 * Nothing here acts on a session, so there is nothing to forge.
 */

export const MAX_ENVELOPE_BYTES = 512 * 1024;
const TUNNEL_LIMIT = { limit: 60, windowSeconds: 60 };
const UPSTREAM_TIMEOUT_MS = 5000;

function configuredDsn() {
  return parseDsn(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || undefined);
}

export async function POST(request: Request): Promise<Response> {
  const dsn = configuredDsn();
  if (!dsn) return new Response(null, { status: 404 });

  const { ip } = getClientIp(request);
  const verdict = await rateLimit(`public:monitoring:ip:${ip}`, TUNNEL_LIMIT, { onStoreError: "allow" });
  if (!verdict.allowed) {
    return new Response(null, { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_ENVELOPE_BYTES) return new Response(null, { status: 413 });
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_ENVELOPE_BYTES) return new Response(null, { status: 413 });

  // The envelope header is the first line: {"dsn": "...", "event_id": ...}.
  const text = new TextDecoder().decode(body);
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? undefined : text.indexOf("\n"));
  let target: ReturnType<typeof parseDsn> = null;
  try {
    target = parseDsn((JSON.parse(firstLine) as { dsn?: string }).dsn);
  } catch {
    target = null;
  }
  if (
    !target ||
    target.origin !== dsn.origin ||
    target.projectId !== dsn.projectId ||
    target.publicKey !== dsn.publicKey
  ) {
    return new Response(null, { status: 400 });
  }

  try {
    const upstream = await fetch(envelopeEndpoint(dsn), {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-sentry-envelope" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return new Response(null, { status: upstream.ok ? 200 : 502 });
  } catch (error) {
    logError({ event: "monitoring.tunnel_failed", error });
    return new Response(null, { status: 502 });
  }
}
