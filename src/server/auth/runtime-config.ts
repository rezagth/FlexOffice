import { logEvent, logError } from "@/server/lib/logger";

/**
 * Tells apart the four situations that used to look identical to
 * `getAuthContext()`, which swallowed every failure and returned `null` —
 * making a database outage indistinguishable from "nobody is signed in".
 *
 *   DEMO            demo mode was asked for on purpose (OFFICEFLEX_DEMO_MODE)
 *   UNCONFIGURED    Supabase/database env vars are missing outside production
 *   MISCONFIGURED   the same, but in production and not declared as a demo
 *   READY           everything needed is present
 *
 * Only READY lets an authentication failure be reported as a real error. The
 * first three degrade to "signed out", which is what keeps the demo-mode
 * contract (a browsable site with zero configuration) intact.
 */

export type AuthRuntimeMode = "DEMO" | "UNCONFIGURED" | "MISCONFIGURED" | "READY";

function env(name: string): string | undefined {
  // `||` not `??`: an unset variable can arrive as "" on some platforms, and
  // "" has to mean "not configured".
  return process.env[name] || undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(env("NEXT_PUBLIC_SUPABASE_URL") && env("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
}

export function isDatabaseConfigured(): boolean {
  return Boolean(env("DATABASE_URL"));
}

/** Demo mode declared explicitly by the operator, rather than inferred. */
export function isDemoModeRequested(): boolean {
  return env("OFFICEFLEX_DEMO_MODE") === "true";
}

let misconfigurationReported = false;

export function getAuthRuntimeMode(): AuthRuntimeMode {
  if (isDemoModeRequested()) return "DEMO";

  const ready = isSupabaseConfigured() && isDatabaseConfigured();
  if (ready) return "READY";

  if (process.env.NODE_ENV !== "production") return "UNCONFIGURED";

  // Production with pieces missing and no demo declaration. This is a
  // deployment mistake, not a design choice.
  //
  // It is still degraded to "signed out" rather than thrown: failing every
  // page because a secret is absent is precisely what the demo-mode contract
  // forbids, and turning a configuration slip into a total outage is worse
  // than serving a signed-out site. So it is reported once per cold start, at
  // error level, and the mode is returned for callers to handle.
  if (!misconfigurationReported) {
    misconfigurationReported = true;
    logError({
      event: "auth.misconfigured_in_production",
      error: new Error(
        "Authentication is disabled because required configuration is missing " +
          "in production. Set NEXT_PUBLIC_SUPABASE_URL, " +
          "NEXT_PUBLIC_SUPABASE_ANON_KEY and DATABASE_URL, or set " +
          "OFFICEFLEX_DEMO_MODE=true if this deployment is meant to be a demo."
      ),
      supabase_configured: isSupabaseConfigured(),
      database_configured: isDatabaseConfigured(),
    });
  }
  return "MISCONFIGURED";
}

/** True when authentication cannot work and that is acceptable. */
export function isAuthDegraded(mode: AuthRuntimeMode): boolean {
  return mode !== "READY";
}

let degradedModeReported = false;

/** Logs the degraded mode once, at a level matching how alarming it is. */
export function reportDegradedMode(mode: AuthRuntimeMode) {
  if (mode === "READY" || mode === "MISCONFIGURED") return; // MISCONFIGURED already logged above
  if (degradedModeReported) return;
  degradedModeReported = true;
  logEvent({ event: "auth.degraded_mode", mode });
}

/** Test-only: forget the once-per-process log guards. */
export function resetRuntimeConfigForTests() {
  misconfigurationReported = false;
  degradedModeReported = false;
}
