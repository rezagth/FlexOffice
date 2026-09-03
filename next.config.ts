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
    // Nothing in the product uses these, so deny them outright rather than
    // leaving the browser defaults in place.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
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

const nextConfig: NextConfig = {
  // Removes `X-Powered-By: Next.js`. Free version disclosure otherwise.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
