import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  orgFind: vi.fn(),
  orgUpdateMany: vi.fn(),
  dossierFind: vi.fn(),
  membersFind: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    organization: { findUnique: m.orgFind, updateMany: m.orgUpdateMany },
    landlordVerification: { findFirst: m.dossierFind },
    organizationMember: { findMany: m.membersFind },
  },
}));
vi.mock("@/server/lib/audit", () => ({ recordAudit: m.audit }));
vi.mock("@/server/domains/notifications/in-app", () => ({ createInAppNotification: m.notify }));

const { verifyOrganizationManually } = await import("@/server/domains/organizations/manual-verification");

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.orgFind.mockResolvedValue({ id: "o1", name: "Durand Conseil SAS", status: "PENDING_VERIFICATION" });
  m.dossierFind.mockResolvedValue(null);
  m.membersFind.mockResolvedValue([{ profileId: "tenant", orgRole: "OWNER", profile: { isLandlord: false } }]);
  m.orgUpdateMany.mockResolvedValue({ count: 1 });
});

describe("verifyOrganizationManually", () => {
  it("verifies a company without dossier, audits it and notifies its owner", async () => {
    const result = await verifyOrganizationManually("admin", "o1", "KBIS vu par téléphone");
    expect(result).toEqual({ status: "VERIFIED", changed: true });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ event: "organization.verified_manually", actorUserId: "admin" }));
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientProfileId: "tenant" }));
  });

  it("refuses a company that lets spaces (its dossier goes through Vérifications)", async () => {
    m.membersFind.mockResolvedValue([{ profileId: "owner", orgRole: "OWNER", profile: { isLandlord: true } }]);
    await expect(verifyOrganizationManually("admin", "o1")).rejects.toMatchObject({ status: 409 });
    expect(m.orgUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses an organization whose dossier is under review", async () => {
    m.dossierFind.mockResolvedValue({ id: "d1" });
    await expect(verifyOrganizationManually("admin", "o1")).rejects.toMatchObject({ status: 409 });
    expect(m.orgUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a suspended organization", async () => {
    m.orgFind.mockResolvedValue({ id: "o1", name: "X", status: "SUSPENDED" });
    await expect(verifyOrganizationManually("admin", "o1")).rejects.toMatchObject({ status: 409 });
  });

  it("refuses an admin validating a company they belong to", async () => {
    m.membersFind.mockResolvedValue([{ profileId: "admin", orgRole: "OWNER", profile: { isLandlord: false } }]);
    await expect(verifyOrganizationManually("admin", "o1")).rejects.toMatchObject({ status: 403 });
    expect(m.orgUpdateMany).not.toHaveBeenCalled();
  });

  it("does nothing when already VERIFIED", async () => {
    m.orgFind.mockResolvedValue({ id: "o1", name: "X", status: "VERIFIED" });
    expect(await verifyOrganizationManually("admin", "o1")).toEqual({ status: "VERIFIED", changed: false });
    expect(m.audit).not.toHaveBeenCalled();
  });
});
