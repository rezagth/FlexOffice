import type { NextConfig } from "next";

/**
 * Security response headers.
 *
 * The config was empty, which meant the application shipped none of these.
 * Each one below is a header whose absence is exploitable and whose presence
 * cannot break a correctly behaving page.
 *
 * DELIBERATELY ABSENT: Content-Security-Policy.
 * A useful CSP for an App Router application needs per-request nonces for the
 * framework's own inline bootstrap scripts, which means generating them in
 * `src/proxy.ts` and threading them through. Shipping a CSP that has not been
 * exercised against every page is how a site silently loses its interactivity
 * in production, so it is scoped as its own piece of work rather than guessed
 * at here. Recorded in the Phase 1 report under PROBLÈMES RESTANTS.
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
    // obvious attack. Superseded by CSP frame-ancestors when that lands.
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
    // Two years, subdomains included. Vercel serves HTTPS only; this stops a
    // first plain-HTTP request from being downgraded or intercepted.
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
  // Removes `X-Powered-By: Next.js`. Free version disclosure otherwise.
  poweredByHeader: false,

  images: {
    remotePatterns: supabaseStoragePattern(),
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
