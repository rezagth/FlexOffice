import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { getAuthContext, requireAuth, requireRole, requireOrg } = await import(
  "@/server/auth/rbac"
);

function mockSignedInAs(profile: {
  id: string;
  email: string;
  name: string;
  role: "CLIENT" | "PARTNER" | "ADMIN";
  organizationId: string | null;
}) {
  getUserMock.mockResolvedValue({ data: { user: { id: profile.id } }, error: null });
  findUniqueMock.mockResolvedValue(profile);
}

function mockSignedOut() {
  getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });
}

beforeEach(() => {
  getUserMock.mockReset();
  findUniqueMock.mockReset();
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
    mockSignedInAs({
      id: "u1",
      email: "a@b.com",
      name: "Alice",
      role: "CLIENT",
      organizationId: null,
    });
    const ctx = await getAuthContext();
    expect(ctx).toEqual({
      userId: "u1",
      email: "a@b.com",
      name: "Alice",
      role: "CLIENT",
      organizationId: null,
    });
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
    mockSignedInAs({
      id: "u1",
      email: "a@b.com",
      name: "Alice",
      role: "ADMIN",
      organizationId: null,
    });
    await expect(requireRole("ADMIN")).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("throws ForbiddenError (403) for a mismatched role — the core tenant/role isolation check", async () => {
    mockSignedInAs({
      id: "u1",
      email: "a@b.com",
      name: "Alice",
      role: "CLIENT",
      organizationId: null,
    });
    await expect(requireRole("ADMIN")).rejects.toMatchObject({ status: 403 });
  });

  it("accepts an array of allowed roles", async () => {
    mockSignedInAs({
      id: "u1",
      email: "a@b.com",
      name: "Alice",
      role: "PARTNER",
      organizationId: "org1",
    });
    await expect(requireRole(["ADMIN", "PARTNER"])).resolves.toMatchObject({
      role: "PARTNER",
    });
  });
});

describe("requireOrg", () => {
  it("returns the organizationId for a linked PARTNER", async () => {
    mockSignedInAs({
      id: "u1",
      email: "a@b.com",
      name: "Alice",
      role: "PARTNER",
      organizationId: "org1",
    });
    await expect(requireOrg()).resolves.toMatchObject({ organizationId: "org1" });
  });

  it("throws ForbiddenError for a PARTNER with no organization linked", async () => {
    mockSignedInAs({
      id: "u1",
      email: "a@b.com",
      name: "Alice",
      role: "PARTNER",
      organizationId: null,
    });
    await expect(requireOrg()).rejects.toMatchObject({ status: 403 });
  });

  it("throws ForbiddenError for a non-PARTNER role", async () => {
    mockSignedInAs({
      id: "u1",
      email: "a@b.com",
      name: "Alice",
      role: "CLIENT",
      organizationId: null,
    });
    await expect(requireOrg()).rejects.toMatchObject({ status: 403 });
  });
});
