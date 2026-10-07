/**
 * Runs in the browser before the application hydrates
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md).
 *
 * Browser error tracking (GlitchTip via the Sentry SDK). Every
 * NEXT_PUBLIC_* value is inlined at build time: without a DSN the import
 * below is dead code and the SDK never reaches the bundle — the demo build
 * ships nothing.
 *
 * Events go to our own origin (/monitoring, see src/app/monitoring/route.ts),
 * which forwards them to GlitchTip: no third-party request from the
 * browser, nothing for an ad blocker to drop, nothing to add to the CSP.
 * No cookie is set and personal data is scrubbed (sentry.shared.ts), which
 * is why it does not wait for the analytics consent.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void Promise.all([import("@sentry/nextjs"), import("./sentry.shared")]).then(([Sentry, shared]) => {
    Sentry.init({
      ...shared.baseSentryOptions({
        dsn,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
        release: process.env.NEXT_PUBLIC_APP_VERSION,
        tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
      }),
      tunnel: shared.SENTRY_TUNNEL_PATH,
    });
  });
}
