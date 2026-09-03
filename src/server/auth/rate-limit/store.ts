/**
 * Storage contract for rate limiting.
 *
 * The point of this seam is that a rate limit is only worth as much as the
 * store behind it. Counting in process memory on a serverless platform counts
 * nothing: every instance keeps its own tally and a cold start resets it. The
 * interface is therefore async from the start — a shared store is a network
 * hop — so swapping the implementation never changes a call site.
 */

export type RateLimitConfig = {
  /** Maximum number of requests allowed inside the window. */
  limit: number;
  /** Length of the window, in seconds. */
  windowSeconds: number;
};

export type RateLimitVerdict = {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Seconds until the caller may retry. Only meaningful when denied. */
  retryAfterSeconds: number;
};

export interface RateLimitStore {
  /** Human-readable name, used in startup logs and diagnostics. */
  readonly name: string;
  /** True when the store is shared across instances — i.e. safe in production. */
  readonly isShared: boolean;
  /** Records one hit against `key` and reports whether it is allowed. */
  consume(key: string, config: RateLimitConfig): Promise<RateLimitVerdict>;
}
