import type { RateLimitConfig, RateLimitStore, RateLimitVerdict } from "./store";

/**
 * In-process fixed-window counter.
 *
 * NOT A PRODUCTION CONTROL. State lives in the memory of one Node process, so
 * on any multi-instance or serverless deployment (this project targets Vercel)
 * an attacker spread over N instances gets N times the limit, and every cold
 * start hands out a fresh allowance. `getRateLimitStore()` refuses to select
 * this store in production unless the operator explicitly acknowledges it.
 *
 * It is the right choice for `pnpm dev` and for tests: no network, no service
 * to run, deterministic.
 */

type Window = { count: number; resetAtMs: number };

/** Cap so a flood of distinct keys cannot grow the map without bound. */
const MAX_WINDOWS = 50_000;

export class MemoryRateLimitStore implements RateLimitStore {
  readonly name = "memory";
  readonly isShared = false;

  private readonly windows = new Map<string, Window>();

  async consume(key: string, config: RateLimitConfig): Promise<RateLimitVerdict> {
    const now = Date.now();
    let window = this.windows.get(key);

    if (!window || window.resetAtMs <= now) {
      if (!window && this.windows.size >= MAX_WINDOWS) {
        this.evictExpiredOrOldest(now);
      }
      window = { count: 0, resetAtMs: now + config.windowSeconds * 1000 };
      this.windows.set(key, window);
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((window.resetAtMs - now) / 1000)
    );

    if (window.count >= config.limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    window.count += 1;
    return {
      allowed: true,
      remaining: config.limit - window.count,
      retryAfterSeconds,
    };
  }

  /** Test-only helper: forget every window. Never called by application code. */
  reset() {
    this.windows.clear();
  }

  private evictExpiredOrOldest(nowMs: number) {
    for (const [key, window] of this.windows) {
      if (window.resetAtMs <= nowMs) this.windows.delete(key);
    }
    if (this.windows.size < MAX_WINDOWS) return;

    let oldestKey: string | null = null;
    let oldestResetAt = Infinity;
    for (const [key, window] of this.windows) {
      if (window.resetAtMs < oldestResetAt) {
        oldestResetAt = window.resetAtMs;
        oldestKey = key;
      }
    }
    if (oldestKey) this.windows.delete(oldestKey);
  }
}
