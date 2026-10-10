/**
 * Error tracking options shared by the browser and the server (GlitchTip,
 * through the Sentry SDK). Isomorphic on purpose: no server import here.
 *
 * Contract:
 *   - no DSN, no SDK: `sentryDsn()` returns undefined and nothing is
 *     initialised, so demo mode and local development send nothing anywhere;
 *   - no personal data leaves: `sendDefaultPii: false`, and `scrubEvent`
 *     removes e-mail addresses, IPs, cookies, authorization headers and
 *     request bodies from every event, transaction and breadcrumb;
 *   - no tracing unless asked: SENTRY_TRACES_SAMPLE_RATE defaults to 0.
 */

export const SENTRY_TUNNEL_PATH = "/monitoring";

export const FILTERED = "[Filtered]";

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Bearer tokens, Supabase/Stripe-style secrets and JWTs that end up inside
// a message or a URL.
const TOKEN_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b(?:sk|rk|whsec|re)_[A-Za-z0-9_]{8,}\b/g,
];
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|session|email|^ip$|ip_address/i;
const SENSITIVE_QUERY = /^(token|access_token|refresh_token|code|key|apikey|email|password|secret)$/i;
const KEPT_HEADERS = new Set(["user-agent", "accept", "accept-language", "content-type", "referer", "x-request-id"]);

export function scrubString(value: string): string {
  let out = value.replace(EMAIL_PATTERN, FILTERED);
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, FILTERED);
  return out;
}

function scrubUrl(value: string): string {
  try {
    const url = new URL(value, "http://placeholder.invalid");
    let changed = false;
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY.test(key)) {
        url.searchParams.set(key, FILTERED);
        changed = true;
      }
    }
    const rebuilt = changed
      ? value.startsWith("http")
        ? url.toString()
        : `${url.pathname}${url.search}${url.hash}`
      : value;
    return scrubString(rebuilt);
  } catch {
    return scrubString(value);
  }
}

function scrubQuery(query: string): string {
  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) {
    if (SENSITIVE_QUERY.test(key)) params.set(key, FILTERED);
  }
  return scrubString(params.toString());
}

/** Deep scrub of free-form data (extra, contexts, breadcrumb data). */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return FILTERED;
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? FILTERED : scrubValue(item, depth + 1);
    }
    return out;
  }
  return value;
}

type Scrubbable = {
  message?: string;
  user?: Record<string, unknown>;
  request?: {
    url?: string;
    query_string?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
    data?: unknown;
    env?: unknown;
  };
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<{ message?: string; data?: Record<string, unknown> }>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
};

/**
 * `beforeSend` / `beforeSendTransaction`. Mutates and returns the event.
 * Typed loosely so the same function serves every SDK entry point.
 */
export function scrubEvent<T extends Scrubbable>(event: T): T {
  if (event.user) {
    // Keep only the opaque account id, which is what correlates an error with
    // our own logs. Never the address, the IP or a username.
    const id = event.user.id;
    event.user = id !== undefined ? { id } : {};
  }

  if (event.request) {
    const request = event.request;
    delete request.cookies;
    delete request.data;
    delete request.env;
    if (request.url) request.url = scrubUrl(request.url);
    if (typeof request.query_string === "string") {
      request.query_string = scrubQuery(request.query_string);
    } else if (request.query_string) {
      request.query_string = FILTERED;
    }
    if (request.headers) {
      const kept: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        if (KEPT_HEADERS.has(name.toLowerCase())) kept[name] = scrubString(String(value));
      }
      request.headers = kept;
    }
  }

  if (event.message) event.message = scrubString(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubString(exception.value);
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => scrubBreadcrumb(crumb));
  }
  if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubValue(event.contexts) as Record<string, unknown>;
  if (event.tags) event.tags = scrubValue(event.tags) as Record<string, unknown>;
  return event;
}

export function scrubBreadcrumb<T extends { message?: string; data?: Record<string, unknown> }>(crumb: T): T {
  if (crumb.message) crumb.message = scrubString(crumb.message);
  if (crumb.data) {
    const data = { ...crumb.data };
    if (typeof data.url === "string") data.url = scrubUrl(data.url);
    if (typeof data.to === "string") data.to = scrubUrl(data.to);
    if (typeof data.from === "string") data.from = scrubUrl(data.from);
    crumb.data = scrubValue(data) as Record<string, unknown>;
  }
  return crumb;
}

export function parseSampleRate(value: string | undefined): number {
  const rate = Number(value);
  if (!value || !Number.isFinite(rate) || rate < 0) return 0;
  return Math.min(rate, 1);
}

export function emptyToUndefined(value: string | undefined): string | undefined {
  return value || undefined;
}

/** Options common to every runtime. `dsn` must be checked by the caller. */
export function baseSentryOptions(params: {
  dsn: string;
  environment?: string;
  release?: string;
  tracesSampleRate?: string;
}) {
  return {
    dsn: params.dsn,
    environment: emptyToUndefined(params.environment) ?? "production",
    release: emptyToUndefined(params.release),
    sendDefaultPii: false,
    tracesSampleRate: parseSampleRate(params.tracesSampleRate),
    // GlitchTip implements errors (and optionally transactions): keep the
    // SDK from sending the other envelope types it does not understand.
    sendClientReports: false,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

export type ParsedDsn = { origin: string; pathPrefix: string; projectId: string; publicKey: string };

/** "https://key@glitchtip.example.fr/3" -> envelope endpoint parts. */
export function parseDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const segments = url.pathname.split("/").filter(Boolean);
    const projectId = segments.pop();
    if (!projectId || !/^\d+$/.test(projectId) || !url.username) return null;
    return {
      origin: url.origin,
      pathPrefix: segments.length ? `/${segments.join("/")}` : "",
      projectId,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

export function envelopeEndpoint(dsn: ParsedDsn): string {
  return `${dsn.origin}${dsn.pathPrefix}/api/${dsn.projectId}/envelope/`;
}
