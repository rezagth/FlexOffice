/**
 * Runs once when a Next.js server instance starts (see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 *
 * Reports, at boot, every production configuration problem found by
 * deployment-config.ts — so a forgotten variable shows up in the container
 * logs on the first start rather than on the first unpaid booking. It never
 * throws: the demo-mode contract forbids turning a missing secret into a
 * total outage (payment routes refuse on their own, see
 * get-payment-provider.ts).
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
}
