import { beforeEach, describe, expect, it, vi } from "vitest";

const { spaceFindFirst, spaceUpdateMany, orgFindUnique, orgUpdate, recordAuditMock, assertProfileIsCompleteMock } = vi.hoisted(() => ({
  spaceFindFirst: vi.fn(),
  spaceUpdateMany: vi.fn(),
  orgFindUnique: vi.fn(),
  orgUpdate: vi.fn(),
  recordAuditMock: vi.fn(),
  assertProfileIsCompleteMock: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    space: { findFirst: spaceFindFirst, updateMany: spaceUpdateMany },
    organization: { findUnique: orgFindUnique, update: orgUpdate },
  },
}));
vi.mock("@/server/lib/audit", () => ({ recordAudit: recordAuditMock }));
vi.mock("@/server/domains/users/profile-completion-guard", () => ({
  assertProfileIsComplete: assertProfileIsCompleteMock,
}));

const { submitSpaceForReview, organizationNeedsPartnerTerms } = await import("@/server/domains/organizations/submit-space");
const { ForbiddenError, ConflictError, NotFoundError, LegalAcceptanceRequiredError } = await import("@/server/lib/errors");
const { PARTNER_TERMS_VERSION } = await import("@/lib/legal-versions");

const ALL = { acceptPartnerTerms: true, certifyRightToLet: true };

beforeEach(() => {
  vi.clearAllMocks();
  spaceFindFirst.mockResolvedValue({ id: "space-1" });
  spaceUpdateMany.mockResolvedValue({ count: 1 });
  orgFindUnique.mockResolvedValue({ partnerTermsVersion: null });
  assertProfileIsCompleteMock.mockResolvedValue(undefined);
});

describe("submitSpaceForReview", () => {
  it("R62: refuses to submit when the actor's own profile is incomplete, before touching the space", async () => {
    assertProfileIsCompleteMock.mockRejectedValue(new ForbiddenError("Complétez votre profil avant de publier un espace."));

    await expect(submitSpaceForReview("org-1", "space-1", "actor-1", ALL)).rejects.toBeInstanceOf(ForbiddenError);
    expect(assertProfileIsCompleteMock).toHaveBeenCalledWith("actor-1", "publier un espace");
    expect(spaceFindFirst).not.toHaveBeenCalled();
    expect(spaceUpdateMany).not.toHaveBeenCalled();
  });

  it("submits a DRAFT space once the profile is complete and both boxes are ticked", async () => {
    await submitSpaceForReview("org-1", "space-1", "actor-1", ALL);
    expect(spaceUpdateMany).toHaveBeenCalledWith({
      where: { id: "space-1", organizationId: "org-1", status: { in: ["DRAFT", "REJECTED"] } },
      data: expect.objectContaining({ status: "PENDING_REVIEW", rightToLetCertifiedByProfileId: "actor-1" }),
    });
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "space.submitted", organizationId: "org-1" })
    );
  });

  it("refuses without the partner CGV when the organization has not accepted the current version", async () => {
    await expect(
      submitSpaceForReview("org-1", "space-1", "actor-1", { certifyRightToLet: true })
    ).rejects.toBeInstanceOf(LegalAcceptanceRequiredError);
    expect(spaceUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses an old accepted version: a new CGV text asks for acceptance again", async () => {
    orgFindUnique.mockResolvedValue({ partnerTermsVersion: "2020-01-01" });
    await expect(
      submitSpaceForReview("org-1", "space-1", "actor-1", { certifyRightToLet: true })
    ).rejects.toBeInstanceOf(LegalAcceptanceRequiredError);
  });

  it("does not ask again once the current version is accepted", async () => {
    orgFindUnique.mockResolvedValue({ partnerTermsVersion: PARTNER_TERMS_VERSION });
    await submitSpaceForReview("org-1", "space-1", "actor-1", { certifyRightToLet: true });
    expect(orgUpdate).not.toHaveBeenCalled();
    expect(spaceUpdateMany).toHaveBeenCalled();
  });

  it("refuses without the right-to-let declaration, even when the CGV are accepted", async () => {
    orgFindUnique.mockResolvedValue({ partnerTermsVersion: PARTNER_TERMS_VERSION });
    await expect(submitSpaceForReview("org-1", "space-1", "actor-1", {})).rejects.toBeInstanceOf(LegalAcceptanceRequiredError);
    expect(spaceUpdateMany).not.toHaveBeenCalled();
  });

  it("records the acceptance with version and author", async () => {
    await submitSpaceForReview("org-1", "space-1", "actor-1", ALL);
    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: expect.objectContaining({ partnerTermsVersion: PARTNER_TERMS_VERSION, partnerTermsAcceptedByProfileId: "actor-1" }),
    });
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ event: "organization.partner_terms_accepted" }));
  });

  it("404s on a space from another organization", async () => {
    spaceFindFirst.mockResolvedValue(null);
    await expect(submitSpaceForReview("org-1", "space-1", "actor-1", ALL)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("409s on a double submit and records no acceptance", async () => {
    spaceUpdateMany.mockResolvedValue({ count: 0 });
    await expect(submitSpaceForReview("org-1", "space-1", "actor-1", ALL)).rejects.toBeInstanceOf(ConflictError);
    expect(orgUpdate).not.toHaveBeenCalled();
  });
});

describe("organizationNeedsPartnerTerms", () => {
  it("is true until the current version is accepted", async () => {
    expect(await organizationNeedsPartnerTerms("org-1")).toBe(true);
    orgFindUnique.mockResolvedValue({ partnerTermsVersion: PARTNER_TERMS_VERSION });
    expect(await organizationNeedsPartnerTerms("org-1")).toBe(false);
  });
});
