import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock("@/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: { profile: { findUnique: findUniqueMock } },
}));

const { getAuthContext, requireAuth, requireRole, requireOrg, requireOrganizationAccess } =
  await import("@/server/auth/rbac");
const { resetRuntimeConfigForTests } = await import("@/server/auth/runtime-config");

type TestProfile = {
  id: string;
  email: string;
  name: string;
  role: "CLIENT" | "PARTNER" | "ADMIN";
  organizationId: string | null;
  deletedAt?: Date | null;
};

function mockSignedInAs(profile: TestProfile) {
  getUserMock.mockResolvedValue({ data: { user: { id: profile.id } }, error: null });
  findUniqueMock.mockResolvedValue({ deletedAt: null, ...profile });
}

function mockSignedOut() {
  getUserMock.mockResolvedValue({
    data: { user: null },
    error: { name: "AuthSessionMissingError", status: 400, message: "no session" },
  });
}

const alice: TestProfile = {
  id: "u1",
  email: "a@b.com",
  name: "Alice",
  role: "CLIENT",
  organizationId: null,
};

beforeEach(() => {
  getUserMock.mockReset();
  findUniqueMock.mockReset();
  resetRuntimeConfigForTests();
  // getAuthContext() now refuses to run against a half-configured backend, so
  // the "configured and healthy" case has to be stated explicitly. Values are
  // placeholders: the Supabase client is mocked above.
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

describe("getAuthContext", () => {
  it("returns null when there is no session", async () => {
    mockSignedOut();
    expect(await getAuthContext()).toBeNull();
  });

  it("returns null when the JWT is valid but no profile exists (defensive)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    findUniqueMock.mockResolvedValue(null);
    expect(await getAuthContext()).toBeNull();
  });

  it("returns the auth context for a signed-in user", async () => {
    mockSignedInAs(alice);
    expect(await getAuthContext()).toEqual({
      userId: "u1",
      email: "a@b.com",
      name: "Alice",
      role: "CLIENT",
      organizationId: null,
    });
  });

  it("returns null for an expired or invalid token — an ordinary signed-out state", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", status: 401, message: "invalid JWT" },
    });
    expect(await getAuthContext()).toBeNull();
  });
});

/**
 * The Phase 1 fix. `getAuthContext()` used to catch everything and return
 * `null`, so a database outage was indistinguishable from a visitor with no
 * session: every protected page silently bounced to /login and nothing was
 * logged. These tests fail if that behaviour comes back.
 */
describe("getAuthContext — infrastructure failures must not look like 'signed out'", () => {
  it("throws 503 when the auth backend is unreachable", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthRetryableFetchError", status: 0, message: "fetch failed" },
    });
    await expect(getAuthContext()).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("throws 503 when the auth backend answers with a server error", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", status: 503, message: "upstream down" },
    });
    await expect(getAuthContext()).rejects.toMatchObject({ status: 503 });
  });

  it("throws 503 when getUser itself rejects", async () => {
    getUserMock.mockRejectedValue(new Error("socket hang up"));
    await expect(getAuthContext()).rejects.toMatchObject({ status: 503 });
  });

  it("throws 503 when the profile lookup fails", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    findUniqueMock.mockRejectedValue(new Error("connection refused"));
    await expect(getAuthContext()).rejects.toMatchObject({ status: 503 });
  });

  it("does not leak the internal message in the error surfaced to the client", async () => {
    getUserMock.mockRejectedValue(new Error("password authentication failed for user"));
    await expect(getAuthContext()).rejects.not.toThrow(/password/);
  });
});

describe("getAuthContext — degraded modes still resolve to 'signed out'", () => {
  it("returns null when demo mode is explicitly requested, even with a session", async () => {
    process.env.OFFICEFLEX_DEMO_MODE = "true";
    mockSignedInAs(alice);
    expect(await getAuthContext()).toBeNull();
  });

  it("returns null when Supabase is not configured, instead of throwing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    mockSignedInAs(alice);
    // The demo-mode contract: a site with no configuration stays browsable.
    expect(await getAuthContext()).toBeNull();
  });

  it("treats an empty env var as absent, not as configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    mockSignedInAs(alice);
    expect(await getAuthContext()).toBeNull();
  });
});

describe("getAuthContext — erased accounts", () => {
  it("refuses a tombstoned profile even if a valid cookie still exists", async () => {
    mockSignedInAs({ ...alice, deletedAt: new Date("2026-09-01T10:00:00Z") });
    expect(await getAuthContext()).toBeNull();
  });
});

describe("requireAuth", () => {
  it("throws UnauthorizedError when signed out", async () => {
    mockSignedOut();
    await expect(requireAuth()).rejects.toMatchObject({ status: 401 });
  });
});

describe("requireRole", () => {
  it("allows a user with the matching role", async () => {
    mockSignedInAs({ ...alice, role: "ADMIN" });
    await expect(requireRole("ADMIN")).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("throws ForbiddenError (403) for a mismatched role — the core tenant/role isolation check", async () => {
    mockSignedInAs(alice);
    await expect(requireRole("ADMIN")).rejects.toMatchObject({ status: 403 });
  });

  it("accepts an array of allowed roles", async () => {
    mockSignedInAs({ ...alice, role: "PARTNER", organizationId: "org1" });
    await expect(requireRole(["ADMIN", "PARTNER"])).resolves.toMatchObject({
      role: "PARTNER",
    });
  });

  it("refuses an admin-only role to a standard user", async () => {
    mockSignedInAs({ ...alice, role: "PARTNER", organizationId: "org1" });
    await expect(requireRole("ADMIN")).rejects.toMatchObject({ status: 403 });
  });
});

describe("requireOrg", () => {
  it("returns the organizationId for a linked PARTNER", async () => {
    mockSignedInAs({ ...alice, role: "PARTNER", organizationId: "org1" });
    await expect(requireOrg()).resolves.toMatchObject({ organizationId: "org1" });
  });

  it("throws ForbiddenError for a PARTNER with no organization linked", async () => {
    mockSignedInAs({ ...alice, role: "PARTNER", organizationId: null });
    await expect(requireOrg()).rejects.toMatchObject({ status: 403 });
  });

  it("throws ForbiddenError for a non-PARTNER role", async () => {
    mockSignedInAs(alice);
    await expect(requireOrg()).rejects.toMatchObject({ status: 403 });
  });
});

/**
 * Tenant isolation for any handler that receives an organization id from the
 * client. Knowing an id must grant nothing.
 */
describe("requireOrganizationAccess", () => {
  it("allows a PARTNER to act for their own organization", async () => {
    mockSignedInAs({ ...alice, role: "PARTNER", organizationId: "org-a" });
    await expect(requireOrganizationAccess("org-a")).resolves.toMatchObject({
      organizationId: "org-a",
    });
  });

  it("refuses a PARTNER acting for another organization", async () => {
    mockSignedInAs({ ...alice, role: "PARTNER", organizationId: "org-a" });
    await expect(requireOrganizationAccess("org-b")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("allows an ADMIN to act for any organization", async () => {
    mockSignedInAs({ ...alice, role: "ADMIN", organizationId: null });
    await expect(requireOrganizationAccess("org-b")).resolves.toMatchObject({
      role: "ADMIN",
    });
  });

  it("refuses a CLIENT outright", async () => {
    mockSignedInAs(alice);
    await expect(requireOrganizationAccess("org-a")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("refuses an unauthenticated caller with 401, not 403", async () => {
    mockSignedOut();
    await expect(requireOrganizationAccess("org-a")).rejects.toMatchObject({
      status: 401,
    });
  });
});
