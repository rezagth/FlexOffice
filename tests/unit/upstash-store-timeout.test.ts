import { afterEach, describe, expect, it, vi } from "vitest";
import { UPSTASH_TIMEOUT_MS, UpstashRateLimitStore } from "@/server/auth/rate-limit/upstash-store";

/**
 * A slow rate-limit store must not turn into a slow site: every call to
 * Upstash / SRH carries a 500 ms abort signal, and a timeout surfaces as an
 * error the caller's onStoreError policy handles.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UpstashRateLimitStore", () => {
  it("bounds every call with a 500 ms timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ result: 1 }, { result: 1 }, { result: 60 }]), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    const store = new UpstashRateLimitStore("https://redis.example.test", "token");
    const verdict = await store.consume("k", { limit: 5, windowSeconds: 60 });

    expect(verdict.allowed).toBe(true);
    expect(UPSTASH_TIMEOUT_MS).toBe(500);
    expect(timeoutSpy).toHaveBeenCalledWith(500);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    timeoutSpy.mockRestore();
  });

  it("fails (instead of hanging) when the store does not answer in time", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        })
    );

    const store = new UpstashRateLimitStore("https://redis.example.test", "token");
    const started = Date.now();
    await expect(store.consume("k", { limit: 5, windowSeconds: 60 })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
