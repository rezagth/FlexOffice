import { RateLimitedError } from "@/server/lib/errors";
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
  /**
   * Opening a letting activity. Creates an organization, so it must not be
   * loopable — but a legitimate caller only ever does it once, and a few
   * retries after a validation error must stay comfortable.
   */
  becomeLandlord: { limit: 5, windowSeconds: 3600 } satisfies RateLimitConfig,
  /**
   * Verification document uploads. A real dossier needs at most 4 documents
   * (see requirements.ts); this leaves comfortable room for mistakes and
   * re-uploads without being an effective way to fill Storage.
   */
  verificationDocumentUpload: { limit: 20, windowSeconds: 3600 } satisfies RateLimitConfig,
  /** "Nous contacter" — public and unauthenticated, so it needs a limit like
   * any other public write; loose enough that a real visitor retrying a
   * typo'd email never hits it. */
  supportTicket: { limit: 5, windowSeconds: 3600 } satisfies RateLimitConfig,
  /**
   * Booking requests, per account. Each one creates a Stripe PaymentIntent
   * and locks a slot until it expires, so an unlimited loop could hold the
   * whole catalogue or card-test stolen cards. A real client books a few
   * slots a day at most.
   */
  bookingCreate: { limit: 10, windowSeconds: 3600 } satisfies RateLimitConfig,
  /** Messages in a booking conversation, per account. */
  messageSend: { limit: 60, windowSeconds: 600 } satisfies RateLimitConfig,
  /** Opening a dispute, per account — rare by nature, and it alerts the admins. */
  disputeRaise: { limit: 5, windowSeconds: 86400 } satisfies RateLimitConfig,
  /** Adding / removing favorites, per account. */
  favoriteToggle: { limit: 120, windowSeconds: 600 } satisfies RateLimitConfig,
  /** Listing / property photo uploads, per account — each one fills Storage. */
  photoUpload: { limit: 60, windowSeconds: 3600 } satisfies RateLimitConfig,
  /** Cancelling a booking, per account (client or landlord side). */
  bookingCancel: { limit: 10, windowSeconds: 3600 } satisfies RateLimitConfig,
  /** Writing a review or a landlord reply, per account — one per booking by
   * construction, this only bounds a scripted loop. */
  reviewWrite: { limit: 20, windowSeconds: 3600 } satisfies RateLimitConfig,
  /** Switching between tenant and landlord mode, per account. */
  accountModeSwitch: { limit: 30, windowSeconds: 3600 } satisfies RateLimitConfig,
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
 * The one request header this deployment's edge sets and a client cannot
 * forge, lower-cased — or null when none is known.
 *
 * It used to be a fixed list tried in order (x-vercel-forwarded-for, then
 * cf-connecting-ip, then x-real-ip), all treated as trustworthy. That is
 * only true on Vercel: behind Cloudflare + Traefik nothing strips an
 * incoming `X-Vercel-Forwarded-For`, so a client sending a random value per
 * request escaped every per-IP limit (login, signup, support, uploads).
 * Which header is trustworthy depends on the hosting, so it is configured:
 *
 *   TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip   behind a Cloudflare tunnel
 *   (unset, on Vercel)                          x-vercel-forwarded-for
 *
 * Only that header is ever read as trusted; every other one is ignored.
 * The edge must also be the only way in (Traefik reachable from cloudflared
 * only), otherwise even the configured header can be sent directly.
 */
export function getTrustedClientIpHeader(): string | null {
  const configured = readEnv("TRUSTED_CLIENT_IP_HEADER")?.trim().toLowerCase();
  if (configured) return configured;
  if (readEnv("VERCEL") === "1") return "x-vercel-forwarded-for";
  return null;
}

/**
 * Client identifier for a rate-limit key.
 *
 * Reads the trusted edge header (see getTrustedClientIpHeader). Without
 * one, the first element of `x-forwarded-for` is used as a best-effort key
 * for local development — the client controls it, so `trusted: false` says
 * so, and a production deployment without TRUSTED_CLIENT_IP_HEADER is
 * reported at boot (deployment-config.ts).
 *
 * When the trusted header is configured but missing from a request (an
 * internal call, a health check), the request is keyed "unknown" rather
 * than falling back to a header the client could forge.
 */
export function getClientIp(request: Request): { ip: string; trusted: boolean } {
  const trustedHeader = getTrustedClientIpHeader();

  if (trustedHeader) {
    const value = request.headers.get(trustedHeader)?.split(",")[0]?.trim();
    if (value) return { ip: value, trusted: true };
    return { ip: "unknown", trusted: false };
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

/**
 * Applies `config` to `key` and throws a 429 when the limit is reached —
 * the one-call form every route uses, so the deny path (log + error) cannot
 * be forgotten.
 *
 * Prefer a per-account key (`user:<id>`) on authenticated routes: it does
 * not depend on the client-IP header at all.
 */
export async function enforceRateLimit(params: {
  key: string;
  config: RateLimitConfig;
  endpoint: string;
  scope: "ip" | "user";
  ipTrusted?: boolean;
  onStoreError?: StoreErrorBehaviour;
}): Promise<void> {
  const verdict = await rateLimit(params.key, params.config, { onStoreError: params.onStoreError });
  if (verdict.allowed) return;

  logRateLimitDenied({
    endpoint: params.endpoint,
    scope: params.scope,
    retryAfterSeconds: verdict.retryAfterSeconds,
    ipTrusted: params.ipTrusted ?? false,
  });
  throw new RateLimitedError("Trop de tentatives. Réessayez plus tard.", verdict.retryAfterSeconds);
}
