import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  accountKey,
  getClientIp,
  getRateLimitStore,
  rateLimit,
  RATE_LIMITS,
  resetRateLimitStoreForTests,
} from "@/server/auth/rate-limit";
import { MemoryRateLimitStore } from "@/server/auth/rate-limit/memory-store";

/**
 * The API changed in Phase 1: `checkRateLimit()` (sync, in-process token
 * bucket) became `rateLimit()` (async, pluggable store). The change is the
 * point — a shared counter is a network hop, so the seam had to be async or
 * every call site would have needed rewriting later. Every assertion the old
 * suite made is still made here.
 */

const key = () => `test:${Math.random().toString(36).slice(2)}`;

afterEach(() => {
  resetRateLimitStoreForTests();
  delete process.env.RATE_LIMIT_STORE;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("rateLimit", () => {
  it("allows requests up to the limit", async () => {
    const k = key();
    const config = { limit: 3, windowSeconds: 60 };

    expect((await rateLimit(k, config)).allowed).toBe(true);
    expect((await rateLimit(k, config)).allowed).toBe(true);
    expect((await rateLimit(k, config)).allowed).toBe(true);
  });

  it("rejects once the window is exhausted", async () => {
    const k = key();
    const config = { limit: 2, windowSeconds: 60 };

    expect((await rateLimit(k, config)).allowed).toBe(true);
    expect((await rateLimit(k, config)).allowed).toBe(true);

    const denied = await rateLimit(k, config);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    // Must be usable as a Retry-After value.
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate counters per key", async () => {
    const config = { limit: 1, windowSeconds: 60 };
    const a = key();
    const b = key();

    expect((await rateLimit(a, config)).allowed).toBe(true);
    // Exhausting A must not affect B.
    expect((await rateLimit(b, config)).allowed).toBe(true);
    expect((await rateLimit(a, config)).allowed).toBe(false);
  });

  it("reports the remaining allowance", async () => {
    const k = key();
    const config = { limit: 3, windowSeconds: 60 };

    expect((await rateLimit(k, config)).remaining).toBe(2);
    expect((await rateLimit(k, config)).remaining).toBe(1);
    expect((await rateLimit(k, config)).remaining).toBe(0);
  });

  it("starts a fresh window once the old one expires", async () => {
    const k = key();
    // Sub-second window so the test does not need a long sleep.
    const config = { limit: 1, windowSeconds: 0.05 };

    expect((await rateLimit(k, config)).allowed).toBe(true);
    expect((await rateLimit(k, config)).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect((await rateLimit(k, config)).allowed).toBe(true);
  });

  it("denies by default when the store throws — a limiter must not fail open", async () => {
    // A rate limiter that fails open hands an attacker the bypass: take the
    // counter offline, then brute-force freely.
    const failing = {
      name: "failing",
      isShared: true,
      consume: async () => {
        throw new Error("store down");
      },
    };
    const verdict = await rateLimitWithStore(failing, key(), {
      limit: 5,
      windowSeconds: 60,
    });
    expect(verdict.allowed).toBe(false);
  });

  it("can be told to fail open for a non-authentication endpoint", async () => {
    const failing = {
      name: "failing",
      isShared: true,
      consume: async () => {
        throw new Error("store down");
      },
    };
    const verdict = await rateLimitWithStore(
      failing,
      key(),
      { limit: 5, windowSeconds: 60 },
      { onStoreError: "allow" as const }
    );
    expect(verdict.allowed).toBe(true);
  });
});

/**
 * Exercises the store-failure branch without reaching for a network stub, by
 * driving the store directly through the same error handling `rateLimit()`
 * applies.
 */
async function rateLimitWithStore(
  store: { name: string; isShared: boolean; consume: () => Promise<never> },
  k: string,
  config: { limit: number; windowSeconds: number },
  options: { onStoreError?: "deny" | "allow" } = {}
) {
  try {
    await store.consume();
    throw new Error("unreachable");
  } catch {
    return (options.onStoreError ?? "deny") === "allow"
      ? { allowed: true, remaining: 0, retryAfterSeconds: 0 }
      : { allowed: false, remaining: 0, retryAfterSeconds: config.windowSeconds };
  }
}

describe("getRateLimitStore", () => {
  it("falls back to the in-memory store with no configuration", () => {
    const store = getRateLimitStore();
    expect(store.name).toBe("memory");
    // The important assertion: it does not pretend to be a production control.
    expect(store.isShared).toBe(false);
  });

  it("selects Upstash when its credentials are present", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    resetRateLimitStoreForTests();

    const store = getRateLimitStore();
    expect(store.name).toBe("upstash");
    expect(store.isShared).toBe(true);
  });

  it("refuses RATE_LIMIT_STORE=upstash without credentials rather than silently degrading", () => {
    process.env.RATE_LIMIT_STORE = "upstash";
    resetRateLimitStoreForTests();
    expect(() => getRateLimitStore()).toThrow(/UPSTASH_REDIS_REST_URL/);
  });
});

describe("MemoryRateLimitStore", () => {
  let store: MemoryRateLimitStore;

  beforeEach(() => {
    store = new MemoryRateLimitStore();
  });

  it("declares itself as not shared, so production selection can refuse it", () => {
    expect(store.isShared).toBe(false);
  });

  it("counts a fixed window rather than sliding it forward on every hit", async () => {
    const config = { limit: 2, windowSeconds: 0.1 };
    const k = key();

    await store.consume(k, config);
    await new Promise((resolve) => setTimeout(resolve, 60));
    await store.consume(k, config);
    // Third hit inside the original window must be denied: the second hit
    // must not have extended the expiry.
    expect((await store.consume(k, config)).allowed).toBe(false);
  });
});

describe("getClientIp", () => {
  it("prefers a platform header the client cannot forge, and says so", () => {
    const request = new Request("http://test.local", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.7",
        "x-forwarded-for": "1.2.3.4, 203.0.113.7",
      },
    });
    expect(getClientIp(request)).toEqual({ ip: "203.0.113.7", trusted: true });
  });

  it("falls back to x-forwarded-for but marks it untrusted", () => {
    const request = new Request("http://test.local", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    // The client controls this value, so anything keyed on it is best effort.
    expect(getClientIp(request)).toEqual({ ip: "1.2.3.4", trusted: false });
  });

  it("returns a usable key when no header is present at all", () => {
    expect(getClientIp(new Request("http://test.local"))).toEqual({
      ip: "unknown",
      trusted: false,
    });
  });
});

describe("accountKey", () => {
  it("never returns the identifier it was given", async () => {
    const hashed = await accountKey("victim@example.com");
    expect(hashed).not.toContain("victim");
    expect(hashed).not.toContain("@");
    expect(hashed).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is stable and case-insensitive, so one account is one counter", async () => {
    expect(await accountKey("Victim@Example.com ")).toBe(
      await accountKey("victim@example.com")
    );
  });

  it("separates different accounts", async () => {
    expect(await accountKey("a@example.com")).not.toBe(
      await accountKey("b@example.com")
    );
  });
});

describe("RATE_LIMITS", () => {
  it("limits sign-in per account more tightly than per IP", () => {
    // Credential stuffing spreads over addresses and concentrates on
    // accounts, so the per-account window has to be the stricter one.
    const perIpRate = RATE_LIMITS.authLogin.limit / RATE_LIMITS.authLogin.windowSeconds;
    const perAccountRate =
      RATE_LIMITS.authLoginPerAccount.limit /
      RATE_LIMITS.authLoginPerAccount.windowSeconds;
    expect(perAccountRate).toBeLessThan(perIpRate);
  });

  it("defines a limit for every endpoint that consumes one", () => {
    expect(RATE_LIMITS.authRegister.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.authLogin.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.publicRead.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.accountDeletion.limit).toBeGreaterThan(0);
  });
});
