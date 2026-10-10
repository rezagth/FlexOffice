import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "./sentry.shared";

/**
 * Server-side error tracking (Node.js runtime), imported by
 * instrumentation.ts `register()` only when a DSN is configured.
 *
 * SENTRY_DSN is read at runtime, so one image can report to the staging or
 * the production GlitchTip project; NEXT_PUBLIC_SENTRY_DSN (baked into the
 * browser bundle at build time) is the fallback.
 */
export function serverSentryDsn(): string | undefined {
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
}

const dsn = serverSentryDsn();

if (dsn) {
  Sentry.init({
    ...baseSentryOptions({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      release: process.env.APP_VERSION,
      tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE,
    }),
  });
}
