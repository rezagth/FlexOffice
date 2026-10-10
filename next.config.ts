import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

/**
 * Security response headers.
 *
 * The config was empty, which meant the application shipped none of these.
 * Each one below is a header whose absence is exploitable and whose presence
 * cannot break a correctly behaving page.
 *
 * Content-Security-Policy is NOT here: it needs a fresh nonce per request,
 * so src/proxy.ts builds it (src/server/config/csp.ts). A static header
 * from this file could only allow inline scripts wholesale.
 */
const securityHeaders = [
  {
    // Blocks MIME sniffing, which is what turns an uploaded "image" into a
    // script. Matters as soon as space photos are served.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // No framing at all: nothing in OfficeFlex is meant to be embedded, and
    // clickjacking a "Réserver" or "Supprimer mon compte" button is the
    // obvious attack. CSP frame-ancestors 'none' says the same to modern
    // browsers; this covers the others, and the report-only rollout phase.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Send the full URL only within our own origin. Booking and space URLs
    // carry identifiers that have no business appearing in a third party's
    // logs.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Deny what the product does not use. Geolocation is allowed for our own
    // pages ("around me" search, search-geolocation.tsx) — `geolocation=()`
    // blocked it entirely. Payment is allowed for us and Stripe's iframe so
    // Apple Pay / Google Pay can work in the Payment Element.
    key: "Permissions-Policy",
    value: 'camera=(), microphone=(), geolocation=(self), payment=(self "https://js.stripe.com"), usb=()',
  },
  {
    // Two years, subdomains included. Cloudflare serves HTTPS only; this
    // stops a first plain-HTTP request from being downgraded or intercepted.
    // `preload` is intentionally omitted: submitting to the HSTS preload list
    // is close to irreversible and is an operational decision, not a code one.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

/**
 * Remote images that next/image may optimize: only the public buckets of our
 * own Supabase Storage (space and property photos). Derived from
 * NEXT_PUBLIC_SUPABASE_URL, which is inlined at build time anyway; without
 * it (demo mode) no remote host is allowed and every image is local.
 *
 * Any other URL (a legacy `Space.photos` entry pointing elsewhere) is not
 * optimized: src/lib/images.ts renders it `unoptimized`, so our server never
 * fetches arbitrary third-party URLs on a visitor's behalf.
 */
function supabaseStoragePattern(): NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return [];
  try {
    const url = new URL(raw);
    return [
      {
        protocol: url.protocol === "http:" ? "http" : "https",
        hostname: url.hostname,
        port: url.port,
        pathname: "/storage/v1/object/public/**",
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  // Self-contained server (.next/standalone/server.js + the traced
  // node_modules it needs) for the Docker image — see Dockerfile.
  output: "standalone",

  // Removes `X-Powered-By: Next.js`. Free version disclosure otherwise.
  poweredByHeader: false,

  images: {
    remotePatterns: supabaseStoragePattern(),
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

/**
 * Error tracking build integration (GlitchTip through the Sentry SDK).
 *
 * Source maps are generated and uploaded ONLY when SENTRY_AUTH_TOKEN is
 * present — in the image build of the deploy pipeline. Everywhere else
 * (local, CI checks, demo) nothing is uploaded and no map is produced.
 * Uploaded maps are deleted from the build output so they are never served.
 *
 * The SDK's `tunnelRoute` option is deliberately not used: it only rewrites
 * to sentry.io. Our tunnel is src/app/monitoring/route.ts.
 */
const sentryUploadEnabled = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default withSentryConfig(nextConfig, {
  sentryUrl: process.env.SENTRY_URL || undefined,
  org: process.env.SENTRY_ORG || undefined,
  project: process.env.SENTRY_PROJECT || undefined,
  authToken: process.env.SENTRY_AUTH_TOKEN || undefined,
  release: { name: process.env.APP_VERSION || undefined, create: sentryUploadEnabled },
  sourcemaps: { disable: !sentryUploadEnabled, deleteSourcemapsAfterUpload: true },
  telemetry: false,
  silent: !process.env.CI,
});
