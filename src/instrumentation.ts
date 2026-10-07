import type { Instrumentation } from "next";

/**
 * Runs once when a Next.js server instance starts (see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 *
 * 1. Reports, at boot, every production configuration problem found by
 *    deployment-config.ts — so a forgotten variable shows up in the container
 *    logs on the first start rather than on the first unpaid booking. It
 *    never throws: the demo-mode contract forbids turning a missing secret
 *    into a total outage (payment routes refuse on their own, see
 *    get-payment-provider.ts).
 * 2. Starts server-side error tracking (GlitchTip) when a DSN is configured.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { collectProductionConfigProblems, describeActiveIntegrations } = await import(
    "@/server/config/deployment-config"
  );
  const { logError, logEvent } = await import("@/server/lib/logger");

  logEvent({ event: "app.boot", ...describeActiveIntegrations() });

  for (const problem of collectProductionConfigProblems()) {
    logError({
      event: "config.production_problem",
      error: new Error(problem.message),
      key: problem.key,
      area: problem.area,
    });
  }

  await import("./sentry.server.config");
}

/**
 * Every error Next.js catches while rendering a page, running a route
 * handler, a server action or the proxy. Logged with the request id the
 * proxy assigned (so the log line, the GlitchTip event and the user's
 * report can be matched), then sent to GlitchTip when configured.
 *
 * Route handlers wrapped in withErrorHandling answer their own errors and
 * never reach this hook — only what escaped is reported here.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { logError, REQUEST_ID_HEADER } = await import("@/server/lib/logger");
  const rawRequestId = request.headers[REQUEST_ID_HEADER];
  const requestId = Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId;
  logError({
    event: "request.unhandled_error",
    error,
    request_id: requestId,
    method: request.method,
    // Path without the query string: it can carry tokens (auth callbacks).
    path: request.path.split("?")[0],
    route: context.routePath,
    route_type: context.routeType,
  });

  const { serverSentryDsn } = await import("./sentry.server.config");
  if (!serverSentryDsn()) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.withScope((scope) => {
    if (requestId) scope.setTag("request_id", requestId);
    Sentry.captureRequestError(error, request, context);
  });
};
