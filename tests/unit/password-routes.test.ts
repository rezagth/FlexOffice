import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/server/lib/errors";

const resetPasswordForEmailMock = vi.fn();
const updateUserMock = vi.fn();
const getClaimsMock = vi.fn();
const signOutMock = vi.fn();
const requireAuthMock = vi.fn();
const verifyCurrentPasswordMock = vi.fn();
const recordAuditMock = vi.fn();

vi.mock("@/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      resetPasswordForEmail: resetPasswordForEmailMock,
      updateUser: updateUserMock,
      getClaims: getClaimsMock,
      signOut: signOutMock,
    },
  }),
}));
vi.mock("@/server/auth/rbac", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/server/lib/audit", () => ({ recordAudit: recordAuditMock }));
vi.mock("@/server/domains/users/reauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/domains/users/reauth")>();
  return {
    ...actual,
    verifyCurrentPassword: verifyCurrentPasswordMock,
    assertCurrentPassword: async (email: string, password: string) => {
      if (!(await verifyCurrentPasswordMock(email, password))) throw new actual.InvalidCurrentPasswordError();
    },
  };
});

const { POST: forgot } = await import("@/app/api/auth/password/forgot/route");
const { POST: update } = await import("@/app/api/auth/password/update/route");
const { isRecentRecoverySession, NEUTRAL_FORGOT_MESSAGE, RECOVERY_WINDOW_SECONDS } = await import(
  "@/server/domains/users/password"
);
const { resetRateLimitStoreForTests } = await import("@/server/auth/rate-limit");
const { resetRuntimeConfigForTests } = await import("@/server/auth/runtime-config");

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function randomIp() {
  return `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  for (const mock of [resetPasswordForEmailMock, updateUserMock, getClaimsMock, signOutMock, verifyCurrentPasswordMock]) {
    mock.mockReset();
  }
  recordAuditMock.mockReset().mockResolvedValue(undefined);
  requireAuthMock.mockReset().mockResolvedValue({ userId: "user-a", email: "a@example.com" });
  signOutMock.mockResolvedValue({ error: null });
  resetRateLimitStoreForTests();
  resetRuntimeConfigForTests();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.DATABASE_URL = "postgresql://test/test";
  process.env.TRUSTED_CLIENT_IP_HEADER = "cf-connecting-ip";
  process.env.APP_URL = "https://app.officeflex.test";
  delete process.env.OFFICEFLEX_DEMO_MODE;
});

afterEach(() => {
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "DATABASE_URL",
    "TRUSTED_CLIENT_IP_HEADER",
    "APP_URL",
    "OFFICEFLEX_DEMO_MODE",
  ]) {
    delete process.env[name];
  }
});

describe("POST /api/auth/password/forgot (B-15)", () => {
  const url = "http://test.local/api/auth/password/forgot";

  it("answers identically whether or not the address exists, and whether or not sending failed", async () => {
    resetPasswordForEmailMock.mockResolvedValueOnce({ data: {}, error: null });
    const ok = await forgot(jsonRequest(url, { email: "known@example.com" }, { "cf-connecting-ip": randomIp() }));
    resetPasswordForEmailMock.mockResolvedValueOnce({
      data: null,
      error: { code: "user_not_found", status: 400, message: "User not found" },
    });
    const ko = await forgot(jsonRequest(url, { email: "unknown@example.com" }, { "cf-connecting-ip": randomIp() }));

    expect(ok.status).toBe(202);
    expect(ko.status).toBe(202);
    expect(await ok.json()).toEqual({ message: NEUTRAL_FORGOT_MESSAGE });
    expect(await ko.json()).toEqual({ message: NEUTRAL_FORGOT_MESSAGE });
  });

  it("builds the reset link on APP_URL, never on a forged Host header", async () => {
    resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null });
    await forgot(
      jsonRequest(url, { email: "a@example.com" }, { "cf-connecting-ip": randomIp(), host: "evil.example", "x-forwarded-host": "evil.example" })
    );
    expect(resetPasswordForEmailMock).toHaveBeenCalledWith("a@example.com", {
      redirectTo: "https://app.officeflex.test/auth/confirm?next=/reset-password",
    });
  });

  it("limits requests per address across IPs (mail-bombing), with a 429", async () => {
    resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await forgot(jsonRequest(url, { email: "victim@example.com" }, { "cf-connecting-ip": randomIp() }));
      statuses.push(res.status);
    }
    expect(statuses).toEqual([202, 202, 202, 429]);
    expect(resetPasswordForEmailMock).toHaveBeenCalledTimes(3);
  });

  it("limits requests per IP", async () => {
    resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null });
    const ip = randomIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await forgot(jsonRequest(url, { email: `u${i}@example.com` }, { "cf-connecting-ip": ip }));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 202)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("rejects a malformed address with 400 and French field messages", async () => {
    const res = await forgot(jsonRequest(url, { email: "nope" }, { "cf-connecting-ip": randomIp() }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.issues[0].message).toBe("Adresse e-mail invalide.");
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it("answers 503 in demo mode instead of crashing", async () => {
    process.env.OFFICEFLEX_DEMO_MODE = "true";
    const res = await forgot(jsonRequest(url, { email: "a@example.com" }, { "cf-connecting-ip": randomIp() }));
    expect(res.status).toBe(503);
  });
});

describe("POST /api/auth/password/update", () => {
  const url = "http://test.local/api/auth/password/update";

  it("requires a session", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await update(jsonRequest(url, { password: "newpassword" }));
    expect(res.status).toBe(401);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("applies the signup password rule (8 characters minimum)", async () => {
    const res = await update(jsonRequest(url, { password: "short", currentPassword: "old" }));
    expect(res.status).toBe(400);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("from the account page: re-verifies the current password against the SESSION's address", async () => {
    verifyCurrentPasswordMock.mockResolvedValue(true);
    updateUserMock.mockResolvedValue({ data: {}, error: null });
    const res = await update(
      jsonRequest(url, { password: "newpassword", currentPassword: "oldpassword", email: "other@example.com" })
    );
    expect(res.status).toBe(200);
    expect(verifyCurrentPasswordMock).toHaveBeenCalledWith("a@example.com", "oldpassword");
    expect(updateUserMock).toHaveBeenCalledWith({ password: "newpassword" });
    expect(signOutMock).toHaveBeenCalledWith({ scope: "others" });
  });

  it("refuses a wrong current password with 403 INVALID_PASSWORD, changing nothing", async () => {
    verifyCurrentPasswordMock.mockResolvedValue(false);
    const res = await update(jsonRequest(url, { password: "newpassword", currentPassword: "wrong" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("INVALID_PASSWORD");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("without a current password: allowed only for a fresh recovery session", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { amr: [{ method: "recovery", timestamp: nowSeconds() - 60 }] } },
      error: null,
    });
    updateUserMock.mockResolvedValue({ data: {}, error: null });
    const res = await update(jsonRequest(url, { password: "newpassword" }));
    expect(res.status).toBe(200);
    expect(updateUserMock).toHaveBeenCalledOnce();
  });

  it("without a current password: refused for an ordinary password session (stolen cookie)", async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { amr: [{ method: "password", timestamp: nowSeconds() - 60 }] } },
      error: null,
    });
    const res = await update(jsonRequest(url, { password: "newpassword" }));
    expect(res.status).toBe(403);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("maps same_password to a French validation message", async () => {
    verifyCurrentPasswordMock.mockResolvedValue(true);
    updateUserMock.mockResolvedValue({ data: null, error: { code: "same_password", status: 422, message: "x" } });
    const res = await update(jsonRequest(url, { password: "newpassword", currentPassword: "newpassword" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/différent/);
  });
});

describe("isRecentRecoverySession", () => {
  const now = 1_800_000_000;

  it("accepts a recovery (or legacy otp) entry inside the window", () => {
    expect(isRecentRecoverySession([{ method: "recovery", timestamp: now - 10 }], now)).toBe(true);
    expect(isRecentRecoverySession([{ method: "otp", timestamp: now - 10 }], now)).toBe(true);
  });

  it("refuses an expired recovery, other methods, string-form AMR and garbage", () => {
    expect(isRecentRecoverySession([{ method: "recovery", timestamp: now - RECOVERY_WINDOW_SECONDS - 1 }], now)).toBe(false);
    expect(isRecentRecoverySession([{ method: "password", timestamp: now }], now)).toBe(false);
    expect(isRecentRecoverySession([{ method: "magiclink", timestamp: now }], now)).toBe(false);
    expect(isRecentRecoverySession(["recovery"], now)).toBe(false);
    expect(isRecentRecoverySession(undefined, now)).toBe(false);
    expect(isRecentRecoverySession([{ method: "recovery", timestamp: now + 3600 }], now)).toBe(false);
  });
});
