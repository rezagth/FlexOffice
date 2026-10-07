import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/health/live must answer without touching any dependency (it is the
 * container healthcheck); /api/health/ready must fail closed with 503 when
 * the database or Supabase Auth is down; /api/health stays an alias of ready.
 */

const queryRawMock = vi.fn();
const rateLimitMock = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRawMock(...args) },
}));

vi.mock("@/server/auth/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/rate-limit")>();
  return { ...actual, rateLimit: (...args: unknown[]) => rateLimitMock(...args) };
});

vi.mock("@/server/lib/logger", () => ({ logError: vi.fn(), logEvent: vi.fn() }));

const { GET: live } = await import("@/app/api/health/live/route");
const { GET: ready } = await import("@/app/api/health/ready/route");
const { GET: legacy } = await import("@/app/api/health/route");
const { AUTH_HEALTH_TIMEOUT_MS } = await import("@/app/api/health/readiness");

const fetchMock = vi.fn();

function request(path: string, headers: Record<string, string> = {}) {
  return new Request(`http://test.local${path}`, { headers });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  queryRawMock.mockReset().mockResolvedValue([{ "?column?": 1 }]);
  rateLimitMock.mockReset().mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("OFFICEFLEX_DEMO_MODE", "");
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@db:5432/app");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth.example.test/");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "cf-connecting-ip");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/health/live", () => {
  it("answers 200 without touching the database, Supabase or the rate limiter", async () => {
    vi.stubEnv("APP_VERSION", "abc1234");
    queryRawMock.mockRejectedValue(new Error("db down"));
    fetchMock.mockRejectedValue(new Error("auth down"));

    const res = live();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: "abc1234" });
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rateLimitMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/health/ready", () => {
  it("answers 200 when the database and GoTrue are reachable", async () => {
    const res = await ready(request("/api/health/ready"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "reachable", auth: "reachable" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://auth.example.test/auth/v1/health");
    expect(init.headers).toEqual({ apikey: "anon-key" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("answers 503 when the database is unreachable", async () => {
    queryRawMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await ready(request("/api/health/ready"));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error", database: "unreachable", auth: "reachable" });
  });

  it("answers 503 when GoTrue answers an error status", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 502 }));

    const res = await ready(request("/api/health/ready"));

    expect(res.status).toBe(503);
    expect((await res.json()).auth).toBe("unreachable");
  });

  it("answers 503 when GoTrue does not answer within the timeout", async () => {
    expect(AUTH_HEALTH_TIMEOUT_MS).toBe(2000);
    fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));

    const res = await ready(request("/api/health/ready"));

    expect(res.status).toBe(503);
    expect((await res.json()).auth).toBe("unreachable");
  });

  it("fails a real production deployment that is missing its configuration", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const res = await ready(request("/api/health/ready"));

    expect(res.status).toBe(503);
    expect((await res.json()).database).toBe("not_configured");
  });

  it("stays green in demo mode, where no dependency is expected", async () => {
    vi.stubEnv("OFFICEFLEX_DEMO_MODE", "true");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    const res = await ready(request("/api/health/ready"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "skipped", auth: "skipped" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never leaks the underlying error in the body", async () => {
    queryRawMock.mockRejectedValue(new Error("password authentication failed for user admin"));

    const res = await ready(request("/api/health/ready"));

    expect(JSON.stringify(await res.json())).not.toContain("password");
  });

  it("is rate limited per trusted client IP", async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 42 });

    const res = await ready(request("/api/health/ready", { "cf-connecting-ip": "203.0.113.9" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("does not limit internal probes that carry no trusted IP", async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 42 });

    const res = await ready(request("/api/health/ready"));

    expect(res.status).toBe(200);
    expect(rateLimitMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/health (legacy alias)", () => {
  it("keeps the readiness contract, including the `database` field", async () => {
    const ok = await legacy(request("/api/health"));
    expect(ok.status).toBe(200);
    expect((await ok.json()).database).toBe("reachable");

    queryRawMock.mockRejectedValue(new Error("down"));
    const ko = await legacy(request("/api/health"));
    expect(ko.status).toBe(503);
  });
});
