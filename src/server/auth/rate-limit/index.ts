import { logError, logEvent } from "@/server/lib/logger";
import { MemoryRateLimitStore } from "./memory-store";
import type { RateLimitConfig, RateLimitStore, RateLimitVerdict } from "./store";
import { UpstashRateLimitStore } from "./upstash-store";

export type { RateLimitConfig, RateLimitVerdict, RateLimitStore } from "./store";

/**
 * Rate limiting entry point.
 *
 * Call `rateLimit(key, config)` — the store behind it is chosen from the
 * environment, so a call site never changes when the deployment gains a
 * shared counter.
 *
 * S-03 / S-04 background: the previous implementation was an in-process token
 * bucket, which on Vercel counts per instance and resets on every cold start,
 * and the login limit it defined was never on any execution path. Both are
 * addressed here — the store is pluggable and refuses to pass itself off as a
 * production control, and `RATE_LIMITS.authLogin` is now consumed by
 * POST /api/auth/login.
 */

/**
 * Limits for the endpoints that need one, expressed as a fixed window.
 *
 * Windows, not token buckets: a window maps directly onto one atomic
 * INCR + EXPIRE in a shared store, so the memory and Upstash implementations
 * enforce the same thing rather than approximating each other.
 */
export const RATE_LIMITS = {
  /** Account creation: expensive, and abused to enumerate or spam. */
  authRegister: { limit: 5, windowSeconds: 3600 } satisfies RateLimitConfig,
  /** Sign-in attempts from one IP, across all accounts. */
  authLogin: { limit: 10, windowSeconds: 300 } satisfies RateLimitConfig,
  /**
   * Sign-in attempts against one account, whatever the source IP. Tighter
   * than the per-IP limit: it is what actually slows down credential
   * stuffing spread over many addresses.
   */
  authLoginPerAccount: { limit: 5, windowSeconds: 900 } satisfies RateLimitConfig,
  /** Public endpoints that reach the database without a session. */
  publicRead: { limit: 120, windowSeconds: 60 } satisfies RateLimitConfig,
  /**
   * Slot availability. Tighter than `publicRead` because the booking funnel
   * calls it once per date change, so a browsing visitor is well inside it
   * while a scraper walking a year of dates is not.
   */
  publicAvailability: { limit: 60, windowSeconds: 60 } satisfies RateLimitConfig,
  /** Irreversible, self-service account erasure. */
  accountDeletion: { limit: 3, windowSeconds: 3600 } satisfies RateLimitConfig,
} as const;

type StoreErrorBehaviour = "deny" | "allow";

let cachedStore: RateLimitStore | undefined;
let insecureStoreWarned = false;

function readEnv(name: string): string | undefined {
  // `||` not `??`: an unset variable can arrive as "" depending on the
  // platform, and "" must mean "not configured" (see logger.ts for the bug
  // this caused before).
  return process.env[name] || undefined;
}

/**
 * Selects the store from the environment.
 *
 * RATE_LIMIT_STORE=upstash|memory forces a choice. Left unset, Upstash is
 * used when its credentials are present and memory otherwise — so a
 * zero-config demo deploy still boots, per the demo-mode contract in
 * AGENTS.md / the repo conventions.
 */
export function getRateLimitStore(): RateLimitStore {
  if (cachedStore) return cachedStore;

  const requested = readEnv("RATE_LIMIT_STORE");
  const upstashUrl = readEnv("UPSTASH_REDIS_REST_URL");
  const upstashToken = readEnv("UPSTASH_REDIS_REST_TOKEN");

  if (requested === "upstash" || (!requested && upstashUrl && upstashToken)) {
    if (!upstashUrl || !upstashToken) {
      throw new Error(
        "RATE_LIMIT_STORE=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN"
      );
    }
    cachedStore = new UpstashRateLimitStore(upstashUrl, upstashToken);
    return cachedStore;
  }

  cachedStore = new MemoryRateLimitStore();
  return cachedStore;
}

/** Test-only: drop the memoised store so a test can change the environment. */
export function resetRateLimitStoreForTests() {
  cachedStore = undefined;
  insecureStoreWarned = false;
}

/**
 * True when the selected store cannot enforce a limit across instances while
 * the deployment needs it to. Surfaced loudly rather than silently tolerated.
 */
function assertStoreIsAppropriate(store: RateLimitStore) {
  if (store.isShared) return;
  if (process.env.NODE_ENV !== "production") return;
  if (readEnv("RATE_LIMIT_ALLOW_INSECURE_MEMORY_STORE") === "true") return;
  if (insecureStoreWarned) return;

  insecureStoreWarned = true;
  // Not a thrown error on purpose: taking the whole site down over a missing
  // rate-limit backend would break the demo-mode contract and turn a
  // hardening gap into an outage. It is logged at error level, every cold
  // start, so it cannot be missed in production logs.
  logError({
    event: "rate_limit.insecure_store_in_production",
    error: new Error(
      "Rate limiting is using the in-memory store in production. Limits are " +
        "per-instance and reset on cold start, so they are NOT an effective " +
        "control. Configure UPSTASH_REDIS_REST_URL/TOKEN, or set " +
        "RATE_LIMIT_ALLOW_INSECURE_MEMORY_STORE=true to acknowledge the risk."
    ),
    store: store.name,
  });
}

/**
 * Records one hit against `key` and reports the verdict.
 *
 * `key` must namespace the endpoint and the subject, e.g.
 * `auth:login:ip:203.0.113.4`. Never put a raw email or any other personal
 * datum in it — see `accountKey()`.
 *
 * On a store failure the default is to DENY. A rate limiter that fails open
 * hands an attacker a bypass: knock the counter offline, then brute-force
 * freely. Denying turns the same failure into a visible, loudly logged
 * outage, which is the safer direction for an authentication endpoint. Call
 * sites that genuinely prefer availability may pass
 * `{ onStoreError: "allow" }`.
 */
export async function rateLimit(
  key: string,
  config: RateLimitConfig,
  options: { onStoreError?: StoreErrorBehaviour } = {}
): Promise<RateLimitVerdict> {
  const store = getRateLimitStore();
  assertStoreIsAppropriate(store);

  try {
    return await store.consume(key, config);
  } catch (error) {
    const behaviour = options.onStoreError ?? "deny";
    logError({ event: "rate_limit.store_unavailable", error, store: store.name, behaviour });
    return behaviour === "allow"
      ? { allowed: true, remaining: 0, retryAfterSeconds: 0 }
      : { allowed: false, remaining: 0, retryAfterSeconds: config.windowSeconds };
  }
}

/**
 * Client identifier for a rate-limit key.
 *
 * Reads the headers the hosting platform sets and a client cannot forge,
 * in preference order. `x-forwarded-for` is last and only its first element
 * is available, which the client itself controls — so it is a best-effort
 * fallback for local development, never the basis of a security decision on
 * its own. `trusted` says which case applied, so a log can show whether the
 * limit was keyed on something meaningful.
 */
export function getClientIp(request: Request): { ip: string; trusted: boolean } {
  const platformHeaders = [
    "x-vercel-forwarded-for", // Vercel, set at the edge
    "cf-connecting-ip", // Cloudflare
    "x-real-ip", // common reverse-proxy convention
  ];

  for (const header of platformHeaders) {
    const value = request.headers.get(header)?.trim();
    if (value) return { ip: value, trusted: true };
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) return { ip: forwardedFor, trusted: false };

  return { ip: "unknown", trusted: false };
}

/**
 * Stable, non-reversible key component for an account identifier.
 *
 * Rate-limit keys reach the shared store and can surface in diagnostics, so
 * an email never goes in verbatim. A salted SHA-256 truncated to 128 bits is
 * enough to key a counter and cannot be read back into an address.
 */
export async function accountKey(identifier: string): Promise<string> {
  const salt = readEnv("RATE_LIMIT_KEY_SALT") ?? "officeflex-default-salt";
  const data = new TextEncoder().encode(`${salt}:${identifier.trim().toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Emits the structured log for a denied request. No PII, no raw key. */
export function logRateLimitDenied(fields: {
  endpoint: string;
  scope: string;
  retryAfterSeconds: number;
  ipTrusted: boolean;
}) {
  logEvent({ event: "rate_limit.denied", ...fields });
}
