import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signUpMock = vi.fn();
const updateManyMock = vi.fn();
const findUniqueMock = vi.fn();
const recordAuditMock = vi.fn();

vi.mock("@/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signUp: signUpMock } }),
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: { profile: { updateMany: updateManyMock, findUnique: findUniqueMock } },
}));
vi.mock("@/server/lib/audit", () => ({ recordAudit: recordAuditMock }));

const { POST } = await import("@/app/api/auth/register/route");
const { resetRateLimitStoreForTests } = await import("@/server/auth/rate-limit");
const { resetRuntimeConfigForTests } = await import("@/server/auth/runtime-config");
const { TERMS_VERSION } = await import("@/lib/legal-versions");

/**
 * POST /api/auth/register — SEC-15 (no account enumeration) and B-11
 * (terms acceptance recorded server-side).
 */
const payload = {
  role: "CLIENT",
  email: "someone@example.com",
  password: "supersecret",
  name: "Sam Client",
  acceptTerms: true,
};

function registerRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://test.local/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const newUser = {
  data: { user: { id: "11111111-1111-4111-8111-111111111111", identities: [{ id: "i1" }] }, session: null },
  error: null,
};

beforeEach(() => {
  signUpMock.mockReset();
  updateManyMock.mockReset().mockResolvedValue({ count: 1 });
  findUniqueMock.mockReset().mockResolvedValue({ organizationId: null });
  recordAuditMock.mockReset().mockResolvedValue(undefined);
  resetRateLimitStoreForTests();
  resetRuntimeConfigForTests();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.DATABASE_URL = "postgresql://test/test";
  process.env.TRUSTED_CLIENT_IP_HEADER = "cf-connecting-ip";
  process.env.APP_URL = "https://app.officeflex.test";
});

afterEach(() => {
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "DATABASE_URL",
    "TRUSTED_CLIENT_IP_HEADER",
    "APP_URL",
  ]) {
    delete process.env[name];
  }
});

async function snapshot(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe("POST /api/auth/register — no account enumeration (SEC-15)", () => {
  it("answers a new address and a known address (error form) identically", async () => {
    signUpMock.mockResolvedValueOnce(newUser);
    const fresh = await snapshot(await POST(registerRequest(payload)));

    signUpMock.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "user_already_exists", status: 422, message: "User already registered" },
    });
    const known = await snapshot(await POST(registerRequest(payload)));

    expect(fresh).toEqual({ status: 201, body: { emailConfirmationRequired: true } });
    expect(known).toEqual(fresh);
  });

  it("answers the obfuscated user GoTrue returns for a known address identically, and records nothing", async () => {
    signUpMock.mockResolvedValueOnce({
      data: { user: { id: "fake-id", identities: [] }, session: null },
      error: null,
    });
    const res = await snapshot(await POST(registerRequest(payload)));
    expect(res).toEqual({ status: 201, body: { emailConfirmationRequired: true } });
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("never returns a user id", async () => {
    signUpMock.mockResolvedValueOnce(newUser);
    const body = await (await POST(registerRequest(payload))).json();
    expect(JSON.stringify(body)).not.toContain(newUser.data.user.id);
  });

  it("does not pass GoTrue's own message through on other failures", async () => {
    signUpMock.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "unexpected_failure", status: 500, message: "Database error saving new user" },
    });
    const res = await POST(registerRequest(payload));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("Database error");
  });
});

describe("POST /api/auth/register — terms acceptance (B-11)", () => {
  it("refuses a signup without acceptTerms before calling Supabase", async () => {
    const { acceptTerms, ...rest } = payload;
    void acceptTerms;
    const res = await POST(registerRequest(rest));
    expect(res.status).toBe(400);
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("records the acceptance server-side with the current version, only once", async () => {
    signUpMock.mockResolvedValueOnce(newUser);
    await POST(registerRequest(payload));
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: newUser.data.user.id, termsAcceptedAt: null },
      data: { termsAcceptedAt: expect.any(Date), termsVersion: TERMS_VERSION },
    });
  });

  it("never puts the acceptance in the client-controlled signup metadata", async () => {
    signUpMock.mockResolvedValueOnce(newUser);
    await POST(registerRequest(payload));
    const metadata = signUpMock.mock.calls[0][0].options.data;
    expect(Object.keys(metadata).some((key) => /term|accept/i.test(key))).toBe(false);
  });
});

describe("POST /api/auth/register — confirmation link (B-15)", () => {
  it("points emailRedirectTo at /auth/confirm on APP_URL, never on a forged Host", async () => {
    signUpMock.mockResolvedValueOnce(newUser);
    await POST(registerRequest(payload, { host: "evil.example", "x-forwarded-host": "evil.example" }));
    expect(signUpMock.mock.calls[0][0].options.emailRedirectTo).toBe(
      "https://app.officeflex.test/auth/confirm?next=/post-login"
    );
  });
});
