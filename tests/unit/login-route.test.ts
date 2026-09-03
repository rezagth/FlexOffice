import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInMock = vi.fn();

vi.mock("@/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { signInWithPassword: signInMock },
  }),
}));

const { POST } = await import("@/app/api/auth/login/route");
const { resetRateLimitStoreForTests } = await import("@/server/auth/rate-limit");
const { resetRuntimeConfigForTests } = await import("@/server/auth/runtime-config");

/**
 * POST /api/auth/login exists so sign-in has a server on its path: without
 * one, `RATE_LIMITS.authLogin` was configured and never consumed (S-04), and
 * no failed attempt was ever logged.
 *
 * These tests pin the two properties that matter: the limit is actually
 * applied, and every failure answers identically so the endpoint is not an
 * account-enumeration oracle.
 */
function loginRequest(
  body: unknown,
  ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`
) {
  return new Request("http://test.local/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vercel-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

const credentials = { email: "user@example.com", password: "supersecret" };

beforeEach(() => {
  signInMock.mockReset();
  resetRateLimitStoreForTests();
  resetRuntimeConfigForTests();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.DATABASE_URL = "postgresql://test/test";
  delete process.env.OFFICEFLEX_DEMO_MODE;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.DATABASE_URL;
  delete process.env.OFFICEFLEX_DEMO_MODE;
});

describe("POST /api/auth/login", () => {
  it("returns the user id on success, and no token in the body", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const res = await POST(loginRequest(credentials));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ userId: "u1" });
    // A token in a JSON payload is a token that ends up in a log or a cache.
    // The session travels in cookies set by the SSR client.
    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/access_token|refresh_token/);
  });

  it("rejects bad credentials with 401", async () => {
    signInMock.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    });

    const res = await POST(loginRequest(credentials));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("INVALID_CREDENTIALS");
  });

  it("answers identically for an unknown address and a wrong password", async () => {
    // The enumeration test. Supabase distinguishes these; the route must not.
    signInMock.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    });
    const wrongPassword = await POST(loginRequest(credentials));
    const wrongPasswordBody = await wrongPassword.json();

    signInMock.mockResolvedValue({
      data: { user: null },
      error: { code: "email_not_confirmed", status: 400, message: "Email not confirmed" },
    });
    const unknownAccount = await POST(
      loginRequest({ email: "nobody@example.com", password: "supersecret" })
    );
    const unknownAccountBody = await unknownAccount.json();

    expect(unknownAccount.status).toBe(wrongPassword.status);
    expect(unknownAccountBody).toEqual(wrongPasswordBody);
  });

  it("never echoes the provider's own error message", async () => {
    signInMock.mockResolvedValue({
      data: { user: null },
      error: { code: "user_banned", status: 403, message: "User is banned until 2030" },
    });
    const res = await POST(loginRequest(credentials));
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toMatch(/banned/i);
  });

  it("applies the per-IP limit and answers 429 with Retry-After", async () => {
    signInMock.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials", status: 400, message: "nope" },
    });

    const ip = "198.51.100.42";
    let lastStatus = 0;
    // The per-IP limit is 10 / 5 min; the per-account limit is tighter, so a
    // 429 must arrive well before this loop ends either way.
    for (let attempt = 0; attempt < 12; attempt++) {
      const res = await POST(loginRequest(credentials, ip));
      lastStatus = res.status;
      if (res.status === 429) {
        expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
        return;
      }
    }
    expect(lastStatus).toBe(429);
  });

  it("does not distinguish which limit was hit", async () => {
    signInMock.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials", status: 400, message: "nope" },
    });

    const messages = new Set<string>();
    for (let attempt = 0; attempt < 12; attempt++) {
      const res = await POST(loginRequest(credentials, "198.51.100.77"));
      if (res.status === 429) messages.add((await res.json()).error.message);
    }
    // Saying "too many attempts for this account" would confirm it exists.
    expect(messages.size).toBe(1);
  });

  it("rejects a malformed body with 400 and does not reach the auth backend", async () => {
    const res = await POST(loginRequest({ email: "not-an-email", password: "" }));
    expect(res.status).toBe(400);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("answers 503 when the auth backend is not configured, rather than crashing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await POST(loginRequest(credentials));
    expect(res.status).toBe(503);
    expect(signInMock).not.toHaveBeenCalled();
  });
});
