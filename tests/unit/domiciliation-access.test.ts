import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAuthMock, findActiveMembershipMock, requestFindUnique } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  findActiveMembershipMock: vi.fn(),
  requestFindUnique: vi.fn(),
}));

vi.mock("@/server/auth/rbac", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/server/auth/active-context", () => ({ findActiveMembership: findActiveMembershipMock }));
vi.mock("@/server/db/prisma", () => ({
  prisma: { domiciliationRequest: { findUnique: requestFindUnique } },
}));

const { requireDomiciliationOrgAccess, requireDomiciliationRequestAccess } = await import(
  "@/server/domains/organizations/domiciliation-access"
);
const { ForbiddenError, NotFoundError } = await import("@/server/lib/errors");

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ userId: "user-1" });
});

describe("requireDomiciliationOrgAccess", () => {
  it.each(["OWNER", "ADMIN"])("allows an active %s member", async (orgRole) => {
    findActiveMembershipMock.mockResolvedValue({ orgRole });
    await expect(requireDomiciliationOrgAccess("org-1")).resolves.toMatchObject({ userId: "user-1" });
  });

  it.each(["MANAGER", "ACCOUNTANT", "VIEWER"])("refuses an active %s member", async (orgRole) => {
    findActiveMembershipMock.mockResolvedValue({ orgRole });
    await expect(requireDomiciliationOrgAccess("org-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a non-member entirely", async () => {
    findActiveMembershipMock.mockResolvedValue(null);
    await expect(requireDomiciliationOrgAccess("org-1")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("requireDomiciliationRequestAccess", () => {
  it("404s when the request doesn't exist", async () => {
    requestFindUnique.mockResolvedValue(null);
    await expect(requireDomiciliationRequestAccess("req-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("re-derives the organization from the REQUEST, never a client-supplied one", async () => {
    requestFindUnique.mockResolvedValue({ id: "req-1", organizationId: "org-1" });
    findActiveMembershipMock.mockResolvedValue({ orgRole: "OWNER" });
    const { ctx, request } = await requireDomiciliationRequestAccess("req-1");
    expect(ctx.userId).toBe("user-1");
    expect(request.organizationId).toBe("org-1");
    expect(findActiveMembershipMock).toHaveBeenCalledWith("user-1", "org-1");
  });
});
