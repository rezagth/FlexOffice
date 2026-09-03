import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const findUniqueMock = vi.fn();
const memberFindFirstMock = vi.fn();
const memberFindManyMock = vi.fn();

vi.mock("@/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    profile: { findUnique: findUniqueMock },
    organizationMember: {
      findFirst: memberFindFirstMock,
      findMany: memberFindManyMock,
    },
  },
}));

const {
  getAuthContext,
  requireAuth,
  requireRole,
  requireOrg,
  requireCapability,
  requireAdmin,
  requireOrganizationAccess,
} = await import("@/server/auth/rbac");
const { resetRuntimeConfigForTests } = await import("@/server/auth/runtime-config");

type TestProfile = {
  id: string;
  email: string;
  name: string;
  platformRole: "USER" | "ADMIN";
  isLandlord: boolean;
  activeMode: "TENANT" | "LANDLORD";
  activeOrganizationId: string | null;
  deletedAt?: Date | null;
  /** Legacy column, still present. Never read for authorization. */
  role?: "CLIENT" | "PARTNER" | "ADMIN";
};

type TestMembership = {
  organizationId: string;
  orgRole: "OWNER" | "ADMIN" | "MANAGER" | "ACCOUNTANT" | "VIEWER";
  organizationName?: string;
};

function mockSignedInAs(profile: TestProfile, memberships: TestMembership[] = []) {
  getUserMock.mockResolvedValue({ data: { user: { id: profile.id } }, error: null });
  findUniqueMock.mockResolvedValue({ deletedAt: null, role: "CLIENT", ...profile });

  const rows = memberships.map((m) => ({
    organizationId: m.organizationId,
    orgRole: m.orgRole,
    organization: { name: m.organizationName ?? `Org ${m.organizationId}` },
  }));

  memberFindFirstMock.mockImplementation(async ({ where }) => {
    const match = rows.find((r) => r.organizationId === where.organizationId);
    if (!match) return null;
    if (where.orgRole?.in && !where.orgRole.in.includes(match.orgRole)) return null;
    return match;
  });
  memberFindManyMock.mockResolvedValue(rows);
}

function mockSignedOut() {
  getUserMock.mockResolvedValue({
    data: { user: null },
    error: { name: "AuthSessionMissingError", status: 400, message: "no session" },
  });
}

const tenant: TestProfile = {
  id: "u1",
  email: "a@b.com",
  name: "Alice",
  platformRole: "USER",
  isLandlord: false,
  activeMode: "TENANT",
  activeOrganizationId: null,
};

const landlord: TestProfile = {
  ...tenant,
  isLandlord: true,
  activeMode: "LANDLORD",
  activeOrganizationId: "org-a",
};

beforeEach(() => {
  getUserMock.mockReset();
  findUniqueMock.mockReset();
  memberFindFirstMock.mockReset();
  memberFindManyMock.mockReset();
  memberFindFirstMock.mockResolvedValue(null);
  memberFindManyMock.mockResolvedValue([]);
  resetRuntimeConfigForTests();
  // getAuthContext() refuses to run against a half-configured backend, so the
  // healthy case has to be stated. Placeholders: Supabase is mocked above.
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

  it("returns the auth context for a signed-in tenant", async () => {
    mockSignedInAs(tenant);
    const ctx = await getAuthContext();

    expect(ctx).toMatchObject({
      userId: "u1",
      email: "a@b.com",
      name: "Alice",
      platformRole: "USER",
      isLandlord: false,
      activeMode: "TENANT",
      activeOrgId: null,
      activeOrgRole: null,
    });
    expect([...ctx!.capabilities].sort()).toEqual([
      "tenant:book",
      "tenant:manage_own_bookings",
      "tenant:search",
    ]);
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
 * The Phase 1 fix, still asserted. `getAuthContext()` used to catch
 * everything and return null, so a database outage looked exactly like a
 * visitor with no session.
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

  it("throws 503 when the membership lookup fails, rather than silently dropping landlord access", async () => {
    // Degrading to "tenant" on a database error would quietly strip a
    // landlord of their organization — an outage must not look like a
    // permission change.
    mockSignedInAs(landlord, [{ organizationId: "org-a", orgRole: "OWNER" }]);
    memberFindFirstMock.mockRejectedValue(new Error("connection refused"));
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
    mockSignedInAs(tenant);
    expect(await getAuthContext()).toBeNull();
  });

  it("returns null when Supabase is not configured, instead of throwing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    mockSignedInAs(tenant);
    expect(await getAuthContext()).toBeNull();
  });

  it("treats an empty env var as absent, not as configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    mockSignedInAs(tenant);
    expect(await getAuthContext()).toBeNull();
  });
});

describe("getAuthContext — erased accounts", () => {
  it("refuses a tombstoned profile even if a valid cookie still exists", async () => {
    mockSignedInAs({ ...tenant, deletedAt: new Date("2026-09-01T10:00:00Z") });
    expect(await getAuthContext()).toBeNull();
  });
});

/**
 * The Phase 2 invariant: the stored active context is a preference, and the
 * membership table is the authority. These fail if the stored columns are
 * ever trusted on their own.
 */
describe("getAuthContext — the active context is revalidated, not trusted", () => {
  it("resolves the landlord context from an ACTIVE membership", async () => {
    mockSignedInAs(landlord, [{ organizationId: "org-a", orgRole: "OWNER" }]);
    const ctx = await getAuthContext();

    expect(ctx).toMatchObject({
      isLandlord: true,
      activeMode: "LANDLORD",
      activeOrgId: "org-a",
      activeOrgRole: "OWNER",
      landlordContextUnavailable: false,
    });
    expect(ctx!.capabilities.has("landlord:manage_spaces")).toBe(true);
  });

  it("ignores a stored organization the user is no longer a member of", async () => {
    // The membership was revoked since the choice was made. The stored id
    // must not resolve to access.
    mockSignedInAs({ ...landlord, activeOrganizationId: "org-gone" }, []);
    const ctx = await getAuthContext();

    expect(ctx).toMatchObject({
      activeMode: "TENANT",
      activeOrgId: null,
      activeOrgRole: null,
      landlordContextUnavailable: true,
    });
    expect(ctx!.capabilities.has("landlord:manage_spaces")).toBe(false);
  });

  it("falls back to another organization the user is actually a member of", async () => {
    mockSignedInAs({ ...landlord, activeOrganizationId: "org-gone" }, [
      { organizationId: "org-b", orgRole: "MANAGER" },
    ]);
    const ctx = await getAuthContext();

    expect(ctx).toMatchObject({ activeOrgId: "org-b", activeOrgRole: "MANAGER" });
  });

  it("never grants a landlord context to an account without the capability", async () => {
    // A membership row without isLandlord is an inconsistent state; it must
    // resolve to no landlord access rather than being trusted.
    mockSignedInAs({ ...tenant, activeOrganizationId: "org-a" }, [
      { organizationId: "org-a", orgRole: "OWNER" },
    ]);
    const ctx = await getAuthContext();

    expect(ctx!.activeOrgId).toBeNull();
    expect(ctx!.capabilities.has("landlord:manage_spaces")).toBe(false);
  });

  it("grants only the capabilities of the role actually held", async () => {
    mockSignedInAs(landlord, [{ organizationId: "org-a", orgRole: "ACCOUNTANT" }]);
    const ctx = await getAuthContext();

    // An accountant sees the money and not the operations. A VIEWER promoting
    // themselves by asking is exactly what this prevents.
    expect(ctx!.capabilities.has("landlord:view_revenue")).toBe(true);
    expect(ctx!.capabilities.has("landlord:manage_spaces")).toBe(false);
    expect(ctx!.capabilities.has("landlord:manage_members")).toBe(false);
  });

  it("keeps tenant capabilities in landlord mode", async () => {
    // Switching to the landlord space does not stop someone booking a room.
    mockSignedInAs(landlord, [{ organizationId: "org-a", orgRole: "OWNER" }]);
    const ctx = await getAuthContext();
    expect(ctx!.capabilities.has("tenant:book")).toBe(true);
  });
});

describe("getAuthContext — platform administration is a separate dimension", () => {
  it("grants back-office access regardless of the active mode", async () => {
    mockSignedInAs({ ...tenant, platformRole: "ADMIN" });
    const ctx = await getAuthContext();

    expect(ctx!.capabilities.has("admin:access_backoffice")).toBe(true);
    // Still an ordinary user who can rent a space.
    expect(ctx!.capabilities.has("tenant:book")).toBe(true);
    expect(ctx!.activeMode).toBe("TENANT");
  });

  it("does not grant landlord capabilities to an admin with no membership", async () => {
    // Being an administrator is not being a member of every organization —
    // requireOrganizationAccess handles cross-tenant back-office access
    // explicitly, which is not the same as holding org capabilities.
    mockSignedInAs({ ...tenant, platformRole: "ADMIN" });
    const ctx = await getAuthContext();
    expect(ctx!.capabilities.has("landlord:manage_spaces")).toBe(false);
  });
});

describe("requireAuth", () => {
  it("throws UnauthorizedError when signed out", async () => {
    mockSignedOut();
    await expect(requireAuth()).rejects.toMatchObject({ status: 401 });
  });
});

describe("requireCapability", () => {
  it("allows a caller holding the capability", async () => {
    mockSignedInAs(landlord, [{ organizationId: "org-a", orgRole: "OWNER" }]);
    await expect(requireCapability("landlord:publish_listing")).resolves.toMatchObject({
      activeOrgId: "org-a",
    });
  });

  it("throws 403 for a capability the caller does not hold", async () => {
    mockSignedInAs(landlord, [{ organizationId: "org-a", orgRole: "VIEWER" }]);
    await expect(requireCapability("landlord:manage_spaces")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("throws 401, not 403, when nobody is signed in", async () => {
    mockSignedOut();
    await expect(requireCapability("tenant:book")).rejects.toMatchObject({ status: 401 });
  });

  it("does not let the active mode stand in for a capability", async () => {
    // LANDLORD mode with no membership grants nothing. The mode is a view,
    // not a permission.
    mockSignedInAs({ ...landlord, activeOrganizationId: null }, []);
    await expect(requireCapability("landlord:manage_spaces")).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("requireAdmin", () => {
  it("allows a platform administrator", async () => {
    mockSignedInAs({ ...tenant, platformRole: "ADMIN" });
    await expect(requireAdmin()).resolves.toMatchObject({ platformRole: "ADMIN" });
  });

  it("refuses an ordinary user, whatever their mode", async () => {
    mockSignedInAs(landlord, [{ organizationId: "org-a", orgRole: "OWNER" }]);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });
});

/**
 * The legacy role guard still behaves, because `ctx.role` is derived from the
 * new fields rather than read from the stale column.
 */
describe("requireRole (deprecated compatibility shim)", () => {
  it("maps a platform administrator to ADMIN", async () => {
    mockSignedInAs({ ...tenant, platformRole: "ADMIN" });
    await expect(requireRole("ADMIN")).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("maps tenant mode to CLIENT", async () => {
    mockSignedInAs(tenant);
    await expect(requireRole("CLIENT")).resolves.toMatchObject({ role: "CLIENT" });
  });

  it("maps landlord mode to PARTNER", async () => {
    mockSignedInAs(landlord, [{ organizationId: "org-a", orgRole: "OWNER" }]);
    await expect(requireRole("PARTNER")).resolves.toMatchObject({ role: "PARTNER" });
  });

  it("throws ForbiddenError (403) for a mismatched role", async () => {
    mockSignedInAs(tenant);
    await expect(requireRole("ADMIN")).rejects.toMatchObject({ status: 403 });
  });

  it("accepts an array of allowed roles", async () => {
    mockSignedInAs(landlord, [{ organizationId: "org-a", orgRole: "OWNER" }]);
    await expect(requireRole(["ADMIN", "PARTNER"])).resolves.toMatchObject({
      role: "PARTNER",
    });
  });

  it("ignores the stale profiles.role column entirely", async () => {
    // Stored as PARTNER, but the account is a tenant with no landlord
    // capability: the derived value must follow the new model.
    mockSignedInAs({ ...tenant, role: "PARTNER" });
    await expect(requireRole("PARTNER")).rejects.toMatchObject({ status: 403 });
  });
});

describe("requireOrg", () => {
  it("returns a non-nullable organization id for a landlord with an ACTIVE membership", async () => {
    mockSignedInAs(landlord, [{ organizationId: "org-a", orgRole: "OWNER" }]);
    await expect(requireOrg()).resolves.toMatchObject({
      activeOrgId: "org-a",
      organizationId: "org-a",
    });
  });

  it("throws ForbiddenError for a landlord whose membership is gone", async () => {
    mockSignedInAs({ ...landlord, activeOrganizationId: "org-gone" }, []);
    await expect(requireOrg()).rejects.toMatchObject({ status: 403 });
  });

  it("throws ForbiddenError for a tenant-only account", async () => {
    mockSignedInAs(tenant);
    await expect(requireOrg()).rejects.toMatchObject({ status: 403 });
  });

  it("does not require the active mode to be LANDLORD", async () => {
    // An API request is authorized by the membership, not by which tab the
    // user had open.
    mockSignedInAs({ ...landlord, activeMode: "TENANT" }, [
      { organizationId: "org-a", orgRole: "OWNER" },
    ]);
    await expect(requireOrg()).resolves.toMatchObject({ activeOrgId: "org-a" });
  });
});

/**
 * Tenant isolation for any handler receiving an organization id from the
 * client. Knowing an id must grant nothing.
 */
describe("requireOrganizationAccess", () => {
  it("allows a member to act for their own organization", async () => {
    mockSignedInAs(landlord, [{ organizationId: "org-a", orgRole: "OWNER" }]);
    await expect(requireOrganizationAccess("org-a")).resolves.toMatchObject({
      userId: "u1",
    });
  });

  it("refuses a member acting for another organization", async () => {
    mockSignedInAs(landlord, [{ organizationId: "org-a", orgRole: "OWNER" }]);
    await expect(requireOrganizationAccess("org-b")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("allows a member to act for any organization they belong to, not only the active one", async () => {
    // activeOrgId records what they last looked at; membership is what
    // authorizes.
    mockSignedInAs({ ...landlord, activeOrganizationId: "org-a" }, [
      { organizationId: "org-a", orgRole: "OWNER" },
      { organizationId: "org-b", orgRole: "MANAGER" },
    ]);
    await expect(requireOrganizationAccess("org-b")).resolves.toMatchObject({
      userId: "u1",
    });
  });

  it("allows an ADMIN to act for any organization", async () => {
    mockSignedInAs({ ...tenant, platformRole: "ADMIN" });
    await expect(requireOrganizationAccess("org-b")).resolves.toMatchObject({
      platformRole: "ADMIN",
    });
  });

  it("refuses a tenant-only account outright", async () => {
    mockSignedInAs(tenant);
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
