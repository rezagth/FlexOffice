/**
 * In-memory token-bucket rate limiter.
 *
 * MVP-scoped limitation: state lives in process memory, so limits are only
 * enforced per server instance. Fine for a single-instance deployment;
 * before scaling to multiple instances, replace the `buckets` Map below
 * with a shared store (Redis/Upstash) behind the same `checkRateLimit`
 * signature so callers don't need to change.
 */

type Bucket = { tokens: number; lastRefillMs: number };

const buckets = new Map<string, Bucket>();

// Periodically drop idle buckets so this Map can't grow without bound.
const MAX_BUCKETS = 50_000;

export type RateLimitConfig = {
  /** Bucket capacity — max burst of requests allowed instantly. */
  capacity: number;
  /** Tokens regained per second. */
  refillPerSecond: number;
};

export function checkRateLimit(key: string, config: RateLimitConfig): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    if (buckets.size >= MAX_BUCKETS) {
      evictOldest();
    }
    bucket = { tokens: config.capacity, lastRefillMs: now };
    buckets.set(key, bucket);
  }

  const elapsedSeconds = (now - bucket.lastRefillMs) / 1000;
  bucket.tokens = Math.min(
    config.capacity,
    bucket.tokens + elapsedSeconds * config.refillPerSecond
  );
  bucket.lastRefillMs = now;

  if (bucket.tokens < 1) {
    return false;
  }

  bucket.tokens -= 1;
  return true;
}

function evictOldest() {
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, bucket] of buckets) {
    if (bucket.lastRefillMs < oldestTime) {
      oldestTime = bucket.lastRefillMs;
      oldestKey = key;
    }
  }
  if (oldestKey) buckets.delete(oldestKey);
}

/** Rate-limit configs for sensitive endpoints, keyed by route. */
export const RATE_LIMITS = {
  authRegister: { capacity: 5, refillPerSecond: 5 / 3600 } satisfies RateLimitConfig, // 5 / hour
  authLogin: { capacity: 10, refillPerSecond: 10 / 300 } satisfies RateLimitConfig, // 10 / 5 min
} as const;

/** Best-effort client identifier for rate-limit keys (proxy trusts this
 * header only because it's the deployment's own edge/CDN setting it —
 * never use it for anything security-critical beyond throttling). */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() ?? "unknown";
}
