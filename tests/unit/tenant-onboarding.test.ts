import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { profileFindUniqueOrThrow, memberFindFirst } = vi.hoisted(() => ({
  profileFindUniqueOrThrow: vi.fn(),
  memberFindFirst: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    profile: { findUniqueOrThrow: profileFindUniqueOrThrow },
    organizationMember: { findFirst: memberFindFirst },
  },
}));

const { getTenantOnboarding } = await import("@/server/domains/users/tenant-onboarding");

const completeProfile = { phone: "0600000000", phoneVerifiedAt: new Date(), accountNeed: "SEARCH", holderType: "INDIVIDUAL" };
const company = (status: string) => ({
  organization: { name: "Durand Conseil SAS", status, holderType: "COMPANY", legalName: "Durand Conseil SAS", siret: "98765432100019" },
});

beforeEach(() => {
  profileFindUniqueOrThrow.mockReset();
  memberFindFirst.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("getTenantOnboarding", () => {
  it("is ready to book for a complete individual with no organization", async () => {
    profileFindUniqueOrThrow.mockResolvedValue(completeProfile);
    memberFindFirst.mockResolvedValue(null);
    const result = await getTenantOnboarding("u1");
    expect(result.readyToBook).toBe(true);
    expect(result.steps.every((s) => s.state === "done")).toBe(true);
  });

  it("points the user to the phone step when the number is not verified", async () => {
    profileFindUniqueOrThrow.mockResolvedValue({ ...completeProfile, phoneVerifiedAt: null });
    memberFindFirst.mockResolvedValue(null);
    const result = await getTenantOnboarding("u1");
    expect(result.readyToBook).toBe(false);
    const phone = result.steps.find((s) => s.state === "todo");
    expect(phone?.href).toBe("/app/complete-profile#telephone");
  });

  it("is not ready while the company awaits validation, and says it is on us (waiting, no link)", async () => {
    profileFindUniqueOrThrow.mockResolvedValue({ ...completeProfile, holderType: "COMPANY" });
    memberFindFirst.mockResolvedValue(company("PENDING_VERIFICATION"));
    const result = await getTenantOnboarding("u1");
    expect(result.readyToBook).toBe(false);
    const waiting = result.steps.find((s) => s.state === "waiting");
    expect(waiting).toBeDefined();
    expect(waiting?.href).toBeUndefined();
  });

  it("is ready once the company is VERIFIED", async () => {
    profileFindUniqueOrThrow.mockResolvedValue({ ...completeProfile, holderType: "COMPANY" });
    memberFindFirst.mockResolvedValue(company("VERIFIED"));
    expect((await getTenantOnboarding("u1")).readyToBook).toBe(true);
  });

  it("only requires a filled phone when verification is switched off", async () => {
    vi.stubEnv("PHONE_VERIFICATION_REQUIRED", "false");
    profileFindUniqueOrThrow.mockResolvedValue({ ...completeProfile, phoneVerifiedAt: null });
    memberFindFirst.mockResolvedValue(null);
    expect((await getTenantOnboarding("u1")).readyToBook).toBe(true);
  });
});
