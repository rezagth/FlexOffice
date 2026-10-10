import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The browser error tunnel must forward OUR project's envelopes to GlitchTip
 * and nothing else — otherwise it is an open relay on our domain.
 */

const rateLimitMock = vi.fn();
vi.mock("@/server/auth/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/rate-limit")>();
  return { ...actual, rateLimit: (...args: unknown[]) => rateLimitMock(...args) };
});
vi.mock("@/server/lib/logger", () => ({ logError: vi.fn(), logEvent: vi.fn() }));

const { POST, MAX_ENVELOPE_BYTES } = await import("@/app/monitoring/route");

const DSN = "https://publickey@glitchtip.example.fr/3";
const fetchMock = vi.fn();

function envelope(dsn: string, extra = "") {
  return `${JSON.stringify({ dsn, event_id: "e1" })}\n{"type":"event"}\n{"message":"boom"}${extra}`;
}

function post(body: string) {
  return POST(new Request("https://app.example.fr/monitoring", { method: "POST", body, headers: { "content-type": "text/plain" } }));
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  rateLimitMock.mockReset().mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /monitoring", () => {
  it("forwards an envelope for our project to the GlitchTip envelope endpoint", async () => {
    const res = await post(envelope(DSN));

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://glitchtip.example.fr/api/3/envelope/");
    expect(init.method).toBe("POST");
    // The client's IP and cookies are not forwarded.
    expect(init.headers).toEqual({ "Content-Type": "application/x-sentry-envelope" });
  });

  it("refuses envelopes addressed to another host or project (no open relay)", async () => {
    expect((await post(envelope("https://publickey@evil.example/3"))).status).toBe(400);
    expect((await post(envelope("https://publickey@glitchtip.example.fr/4"))).status).toBe(400);
    expect((await post(envelope("https://otherkey@glitchtip.example.fr/3"))).status).toBe(400);
    expect((await post("not an envelope")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is a 404 when error tracking is not configured (demo mode)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    vi.stubEnv("SENTRY_DSN", "");
    expect((await post(envelope(DSN))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps the body size", async () => {
    const res = await post(envelope(DSN, "x".repeat(MAX_ENVELOPE_BYTES)));
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 30 });
    const res = await post(envelope(DSN));
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 502 when GlitchTip is down, without leaking why", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:8000"));
    const res = await post(envelope(DSN));
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("");
  });
});
