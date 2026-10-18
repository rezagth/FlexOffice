import { beforeEach, describe, expect, it, vi } from "vitest";
import { isProfileComplete } from "@/server/domains/users/profile-completion";

const { organizationMemberFindFirst } = vi.hoisted(() => ({ organizationMemberFindFirst: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({
  prisma: { organizationMember: { findFirst: organizationMemberFindFirst } },
}));

const { isCompanyInfoComplete } = await import("@/server/domains/users/profile-completion");

beforeEach(() => {
  organizationMemberFindFirst.mockReset();
});

describe("isProfileComplete", () => {
  it("is true only once phone, accountNeed and holderType are all set", () => {
    expect(isProfileComplete({ phone: "0600000000", accountNeed: "SEARCH", holderType: "INDIVIDUAL" })).toBe(true);
  });

  it("is false when the phone is missing or blank", () => {
    expect(isProfileComplete({ phone: null, accountNeed: "SEARCH", holderType: "INDIVIDUAL" })).toBe(false);
    expect(isProfileComplete({ phone: "   ", accountNeed: "SEARCH", holderType: "INDIVIDUAL" })).toBe(false);
  });

  it("is false when accountNeed or holderType was never answered (R15 — predates the column)", () => {
    expect(isProfileComplete({ phone: "0600000000", accountNeed: null, holderType: "INDIVIDUAL" })).toBe(false);
    expect(isProfileComplete({ phone: "0600000000", accountNeed: "SEARCH", holderType: null })).toBe(false);
  });
});

describe("isCompanyInfoComplete", () => {
  it("is true for a profile with no organization membership at all (a plain individual tenant)", async () => {
    organizationMemberFindFirst.mockResolvedValue(null);
    expect(await isCompanyInfoComplete("user-1")).toBe(true);
  });

  it("is true when the active company organization has both legalName and siret", async () => {
    organizationMemberFindFirst.mockResolvedValue({
      organization: { legalName: "Acme SARL", siret: "12345678900011" },
    });
    expect(await isCompanyInfoComplete("user-1")).toBe(true);
  });

  it("is false when the active company organization is missing its legal name", async () => {
    organizationMemberFindFirst.mockResolvedValue({ organization: { legalName: null, siret: "12345678900011" } });
    expect(await isCompanyInfoComplete("user-1")).toBe(false);
  });

  it("only queries memberships of a COMPANY-holder organization", async () => {
    organizationMemberFindFirst.mockResolvedValue(null);
    await isCompanyInfoComplete("user-1");
    expect(organizationMemberFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organization: { holderType: "COMPANY" } }),
      })
    );
  });
});
