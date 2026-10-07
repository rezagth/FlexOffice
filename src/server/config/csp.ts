/**
 * Content-Security-Policy with a per-request nonce (SEC-08).
 *
 * Built by src/proxy.ts for every page request. Next.js reads the nonce back
 * from the request's CSP header and stamps it on its own bootstrap scripts
 * (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md);
 * our own <Script> tags read it from `x-nonce`.
 *
 * Rollout: the policy is sent as `Content-Security-Policy-Report-Only` until
 * CSP_ENFORCE=true. Report-only lets a deployment surface every violation
 * (browser console, and CSP_REPORT_URI when set) without breaking a page —
 * a CSP that has not been exercised against every page is how a site loses
 * its interactivity in production. Switch to enforcing once staging shows no
 * violation on the main journeys (docs/runbooks/securite-entetes.md).
 *
 * Why these sources:
 *   script-src  'strict-dynamic' trusts what our nonced scripts load
 *               (Stripe.js, PostHog's lazy bundles, Next.js chunks); the
 *               host list is the fallback for browsers without CSP level 3.
 *   style-src   'unsafe-inline': React renders `style` attributes (and
 *               Leaflet / motion set them), which a nonce cannot cover.
 *               Style injection is a much weaker vector than script.
 *   img-src     Supabase Storage (space photos), the Unsplash images of the
 *               marketing pages and demo data, OpenStreetMap tiles and the
 *               Leaflet marker icons served from cdnjs.
 *   frame-src   Stripe's card iframe and 3-D Secure challenge.
 *   connect-src Supabase (browser auth client), Stripe API, PostHog, Umami.
 *               GlitchTip goes through our own /monitoring tunnel ('self').
 */

export const NONCE_HEADER = "x-nonce";

export type CspEnv = {
  NODE_ENV?: string;
  CSP_ENFORCE?: string;
  CSP_REPORT_URI?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_POSTHOG_KEY?: string;
  NEXT_PUBLIC_POSTHOG_HOST?: string;
  NEXT_PUBLIC_UMAMI_SRC?: string;
  NEXT_PUBLIC_UMAMI_WEBSITE_ID?: string;
};

export const DEFAULT_POSTHOG_HOST = "https://eu.i.posthog.com";

const STRIPE_SCRIPT = ["https://js.stripe.com", "https://*.js.stripe.com"];
const STRIPE_FRAME = ["https://js.stripe.com", "https://*.js.stripe.com", "https://hooks.stripe.com"];
const STRIPE_CONNECT = ["https://api.stripe.com"];
const STATIC_IMAGE_HOSTS = [
  "https://images.unsplash.com",
  "https://*.tile.openstreetmap.org",
  "https://cdnjs.cloudflare.com",
];

/** 128 bits of randomness, base64 — unguessable and unique per request. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * PostHog serves its lazy-loaded bundles from a sibling "-assets" host:
 * https://eu.i.posthog.com -> https://eu-assets.i.posthog.com.
 */
export function posthogAssetsOrigin(apiOrigin: string): string | null {
  const url = new URL(apiOrigin);
  const match = /^([a-z]{2})\.i\.posthog\.com$/.exec(url.hostname);
  if (!match) return null;
  return `${url.protocol}//${match[1]}-assets.i.posthog.com`;
}

export type AnalyticsOrigins = { posthog: string[]; umami: string | null };

export function analyticsOrigins(env: CspEnv): AnalyticsOrigins {
  const posthog: string[] = [];
  if (env.NEXT_PUBLIC_POSTHOG_KEY) {
    const api = originOf(env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_POSTHOG_HOST);
    if (api) {
      posthog.push(api);
      const assets = posthogAssetsOrigin(api);
      if (assets) posthog.push(assets);
    }
  }
  const umami = env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ? originOf(env.NEXT_PUBLIC_UMAMI_SRC) : null;
  return { posthog, umami };
}

export function isCspEnforced(env: CspEnv): boolean {
  return env.CSP_ENFORCE === "true";
}

export function cspHeaderName(env: CspEnv): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" {
  return isCspEnforced(env) ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}

export function buildContentSecurityPolicy(nonce: string, env: CspEnv): string {
  const isDev = env.NODE_ENV === "development";
  const supabase = originOf(env.NEXT_PUBLIC_SUPABASE_URL);
  const { posthog, umami } = analyticsOrigins(env);
  const analytics = [...posthog, ...(umami ? [umami] : [])];

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      [
        "'self'",
        `'nonce-${nonce}'`,
        "'strict-dynamic'",
        ...STRIPE_SCRIPT,
        ...analytics,
        // React rebuilds server error stacks with eval in development only.
        ...(isDev ? ["'unsafe-eval'"] : []),
      ],
    ],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", ...(supabase ? [supabase] : []), ...STATIC_IMAGE_HOSTS]],
    ["font-src", ["'self'", "data:"]],
    [
      "connect-src",
      [
        "'self'",
        ...(supabase ? [supabase] : []),
        ...STRIPE_CONNECT,
        ...analytics,
        // Hot reload websocket.
        ...(isDev ? ["ws:"] : []),
      ],
    ],
    ["frame-src", STRIPE_FRAME],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];

  const parts = directives.map(([name, sources]) => `${name} ${[...new Set(sources)].join(" ")}`);
  // Ignored (with a console warning) in report-only mode, so only sent when
  // the policy is enforced.
  if (isCspEnforced(env) && !isDev) parts.push("upgrade-insecure-requests");
  if (env.CSP_REPORT_URI) parts.push(`report-uri ${env.CSP_REPORT_URI}`);
  return parts.join("; ");
}
