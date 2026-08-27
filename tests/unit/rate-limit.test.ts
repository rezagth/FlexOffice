import { describe, expect, it } from "vitest";
import { checkRateLimit } from "@/server/auth/rate-limit";

describe("checkRateLimit", () => {
  it("allows requests up to the bucket capacity", () => {
    const key = `test:capacity:${Math.random()}`;
    const config = { capacity: 3, refillPerSecond: 0 };

    expect(checkRateLimit(key, config)).toBe(true);
    expect(checkRateLimit(key, config)).toBe(true);
    expect(checkRateLimit(key, config)).toBe(true);
  });

  it("rejects requests once the bucket is exhausted", () => {
    const key = `test:exhausted:${Math.random()}`;
    const config = { capacity: 2, refillPerSecond: 0 };

    expect(checkRateLimit(key, config)).toBe(true);
    expect(checkRateLimit(key, config)).toBe(true);
    expect(checkRateLimit(key, config)).toBe(false);
  });

  it("keeps separate buckets per key", () => {
    const config = { capacity: 1, refillPerSecond: 0 };
    const keyA = `test:isolation:a:${Math.random()}`;
    const keyB = `test:isolation:b:${Math.random()}`;

    expect(checkRateLimit(keyA, config)).toBe(true);
    // Exhausting bucket A must not affect bucket B.
    expect(checkRateLimit(keyB, config)).toBe(true);
    expect(checkRateLimit(keyA, config)).toBe(false);
  });

  it("refills tokens over time", async () => {
    const key = `test:refill:${Math.random()}`;
    // Very fast refill so the test doesn't need a long sleep.
    const config = { capacity: 1, refillPerSecond: 50 };

    expect(checkRateLimit(key, config)).toBe(true);
    expect(checkRateLimit(key, config)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(checkRateLimit(key, config)).toBe(true);
  });
});
