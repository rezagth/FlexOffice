import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtpMock = vi.fn();
const exchangeCodeMock = vi.fn();

vi.mock("@/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { verifyOtp: verifyOtpMock, exchangeCodeForSession: exchangeCodeMock },
  }),
}));

const { GET } = await import("@/app/auth/confirm/route");
const { resetRuntimeConfigForTests } = await import("@/server/auth/runtime-config");

/**
 * GET /auth/confirm (B-15) — the landing point of every e-mailed auth link.
 * Pins: both link shapes work, `next` cannot become an open redirect, the
 * redirect is built on APP_URL, and a dead link lands somewhere useful.
 */
function confirm(query: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://internal:3000/auth/confirm?${query}`, { headers }));
}

function location(res: Response) {
  return res.headers.get("location");
}

beforeEach(() => {
  verifyOtpMock.mockReset().mockResolvedValue({ data: {}, error: null });
  exchangeCodeMock.mockReset().mockResolvedValue({ data: {}, error: null });
  resetRuntimeConfigForTests();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.DATABASE_URL = "postgresql://test/test";
  process.env.APP_URL = "https://app.officeflex.test";
  delete process.env.OFFICEFLEX_DEMO_MODE;
});

afterEach(() => {
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "DATABASE_URL", "APP_URL", "OFFICEFLEX_DEMO_MODE"]) {
    delete process.env[name];
  }
});

describe("GET /auth/confirm", () => {
  it("verifies a token_hash link and redirects to the validated next path on APP_URL", async () => {
    const res = await confirm("token_hash=abc&type=signup&next=/app/bookings", { host: "evil.example" });
    expect(verifyOtpMock).toHaveBeenCalledWith({ type: "signup", token_hash: "abc" });
    expect(res.status).toBe(303);
    expect(location(res)).toBe("https://app.officeflex.test/app/bookings");
  });

  it.each([
    ["recovery", "https://app.officeflex.test/reset-password"],
    ["email_change", "https://app.officeflex.test/app/account?email=confirmed"],
    ["invite", "https://app.officeflex.test/post-login"],
    ["signup", "https://app.officeflex.test/post-login"],
  ])("defaults `next` per link type (%s)", async (type, expected) => {
    const res = await confirm(`token_hash=abc&type=${type}`);
    expect(location(res)).toBe(expected);
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"])(
    "never redirects off-site (next=%s)",
    async (next) => {
      const res = await confirm(`token_hash=abc&type=signup&next=${encodeURIComponent(next)}`);
      expect(location(res)).toBe("https://app.officeflex.test/post-login");
    }
  );

  it("exchanges a PKCE code", async () => {
    const res = await confirm("code=xyz&next=/reset-password");
    expect(exchangeCodeMock).toHaveBeenCalledWith("xyz");
    expect(location(res)).toBe("https://app.officeflex.test/reset-password");
  });

  it("sends a dead reset link back to the forgot-password page", async () => {
    verifyOtpMock.mockResolvedValue({ data: {}, error: { code: "otp_expired", status: 403 } });
    const res = await confirm("token_hash=abc&type=recovery");
    expect(location(res)).toBe("https://app.officeflex.test/forgot-password?error=link_invalid");
  });

  it("sends any other dead link to the login page with a notice", async () => {
    verifyOtpMock.mockResolvedValue({ data: {}, error: { code: "otp_expired", status: 403 } });
    const res = await confirm("token_hash=abc&type=signup");
    expect(location(res)).toBe("https://app.officeflex.test/login?error=link_invalid");
  });

  it("refuses an unsupported type without calling Supabase", async () => {
    const res = await confirm("token_hash=abc&type=sms");
    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(location(res)).toBe("https://app.officeflex.test/login?error=link_invalid");
  });

  it("refuses a link with neither token nor code", async () => {
    const res = await confirm("next=/app");
    expect(location(res)).toBe("https://app.officeflex.test/login?error=link_invalid");
  });

  it("degrades to a notice in demo mode", async () => {
    process.env.OFFICEFLEX_DEMO_MODE = "true";
    const res = await confirm("token_hash=abc&type=signup");
    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(location(res)).toBe("https://app.officeflex.test/login?error=auth_unavailable");
  });
});
