import { ForbiddenError, ValidationError } from "./errors";

/**
 * Cross-site request forgery guard for state-changing API routes.
 *
 * The session lives in cookies (`@supabase/ssr`), sent with every request
 * to our origin, including ones a third-party site makes the browser send.
 * `SameSite=Lax` blocks most of them but not all: a sibling sub-domain is
 * "same-site", and a top-level `<form enctype="text/plain">` POST can carry
 * a valid JSON body to POST /api/auth/login (`request.json()` ignores the
 * Content-Type), which logs the victim into the attacker's account —
 * they then book, pay or upload KYC documents into it.
 *
 * Rules, for POST/PUT/PATCH/DELETE under /api/ (webhooks and internal jobs
 * excepted: they are called by servers and authenticated by a signature or
 * a bearer secret):
 *
 * 1. If the browser says where the request comes from (`Origin`), it must
 *    be our own host — APP_URL's, or the one the request was addressed
 *    to. Browsers always send `Origin` on cross-origin POSTs, forms
 *    included. `Origin: null` (sandboxed frames, some redirects) is refused.
 *    No `Origin` at all means a non-browser client (curl, a server), which
 *    carries no victim's cookies — allowed.
 * 2. `Sec-Fetch-Site: cross-site` / `same-site` is refused even without an
 *    `Origin`, as a second signal from modern browsers.
 * 3. A body sent as one of the CORS "simple" encodings that HTML forms can
 *    produce without a preflight (`text/plain`,
 *    `application/x-www-form-urlencoded`) is refused: this API only accepts
 *    JSON and multipart uploads.
 */

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const EXEMPT_PREFIXES = ["/api/webhooks/", "/api/internal/"];
const FORM_ONLY_CONTENT_TYPES = ["text/plain", "application/x-www-form-urlencoded"];

function hostOf(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Hosts this request may legitimately originate from: APP_URL, and the host
 * the browser addressed (Host, or X-Forwarded-Host set by the reverse
 * proxy — behind Traefik `request.url` can carry an internal host).
 *
 * Compared on host, not full origin, on purpose: behind a TLS-terminating
 * proxy the scheme seen here is often http while the browser's is https.
 * That loses nothing against CSRF — a forging site cannot make the victim's
 * browser send an Origin on our host, nor rewrite the Host header.
 */
export function allowedHosts(request: Request): Set<string> {
  const hosts = new Set<string>();
  const add = (value: string | null | undefined) => {
    const host = value?.split(",")[0]?.trim().toLowerCase();
    if (host) hosts.add(host);
  };

  const appUrl = process.env.APP_URL || undefined;
  if (appUrl) add(hostOf(appUrl));
  add(hostOf(request.url));
  add(request.headers.get("host"));
  add(request.headers.get("x-forwarded-host"));
  return hosts;
}

export function assertSameOriginRequest(request: Request): void {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return;

  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return;
  }
  if (!pathname.startsWith("/api/")) return;
  if (EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return;

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site" || fetchSite === "same-site") {
    throw new ForbiddenError("Requête refusée : origine non autorisée.");
  }

  const origin = request.headers.get("origin");
  if (origin !== null) {
    const originHost = origin === "null" ? null : hostOf(origin);
    if (!originHost || !allowedHosts(request).has(originHost)) {
      throw new ForbiddenError("Requête refusée : origine non autorisée.");
    }
  }

  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType && FORM_ONLY_CONTENT_TYPES.includes(contentType)) {
    throw new ValidationError("Format de requête non pris en charge.");
  }
}

/**
 * Absolute base URL for links that leave the app (Stripe Connect return
 * URLs, e-mails). APP_URL when set: behind Traefik, `request.url` is the
 * server's own listen address (http://localhost:3000), which Stripe would
 * send the landlord back to. The request's origin is only a fallback for
 * local development.
 */
export function getAppBaseUrl(request: Request): string {
  const appUrl = process.env.APP_URL || undefined;
  if (appUrl) {
    try {
      return new URL(appUrl).origin;
    } catch {
      // fall through to the request origin
    }
  }
  return new URL(request.url).origin;
}
