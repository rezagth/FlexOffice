import type { RateLimitConfig, RateLimitStore, RateLimitVerdict } from "./store";

/**
 * Shared fixed-window counter backed by Upstash Redis.
 *
 * Deliberately written against Upstash's plain HTTP REST API with `fetch`
 * rather than pulling in `@upstash/redis` or `@upstash/ratelimit`: the whole
 * interaction is one pipelined request, and this project does not need another
 * dependency (nor another thing to keep on a supported version) to send it.
 *
 * The window is atomic on the Redis side — INCR then EXPIRE NX in a single
 * pipeline — so concurrent requests across instances share one counter. That
 * is the entire reason this store exists.
 *
 * Enable with:
 *   RATE_LIMIT_STORE=upstash
 *   UPSTASH_REDIS_REST_URL=...
 *   UPSTASH_REDIS_REST_TOKEN=...
 */

const KEY_PREFIX = "officeflex:rl:";

export class UpstashRateLimitStore implements RateLimitStore {
  readonly name = "upstash";
  readonly isShared = true;

  constructor(
    private readonly restUrl: string,
    private readonly restToken: string
  ) {}

  async consume(key: string, config: RateLimitConfig): Promise<RateLimitVerdict> {
    const redisKey = `${KEY_PREFIX}${key}`;

    const response = await fetch(`${this.restUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.restToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        // NX so the very first hit sets the expiry and later hits in the same
        // window do not slide it forward — that is what makes it a fixed
        // window rather than an indefinitely renewing one.
        ["EXPIRE", redisKey, String(config.windowSeconds), "NX"],
        ["TTL", redisKey],
      ]),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Upstash rate limit store returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as Array<{ result?: unknown; error?: string }>;
    const failed = body.find((entry) => entry.error);
    if (failed) {
      throw new Error(`Upstash rate limit store error: ${failed.error}`);
    }

    const count = Number(body[0]?.result ?? 0);
    const ttl = Number(body[2]?.result ?? config.windowSeconds);
    const retryAfterSeconds = ttl > 0 ? ttl : config.windowSeconds;

    if (count > config.limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    return {
      allowed: true,
      remaining: Math.max(0, config.limit - count),
      retryAfterSeconds,
    };
  }
}
