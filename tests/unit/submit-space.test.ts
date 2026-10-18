import { beforeEach, describe, expect, it, vi } from "vitest";

const { spaceFindFirst, spaceUpdateMany, recordAuditMock, assertProfileIsCompleteMock } = vi.hoisted(() => ({
  spaceFindFirst: vi.fn(),
  spaceUpdateMany: vi.fn(),
  recordAuditMock: vi.fn(),
  assertProfileIsCompleteMock: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: { space: { findFirst: spaceFindFirst, updateMany: spaceUpdateMany } },
}));
vi.mock("@/server/lib/audit", () => ({ recordAudit: recordAuditMock }));
vi.mock("@/server/domains/users/profile-completion-guard", () => ({
  assertProfileIsComplete: assertProfileIsCompleteMock,
}));

const { submitSpaceForReview } = await import("@/server/domains/organizations/submit-space");
const { ForbiddenError, ConflictError, NotFoundError } = await import("@/server/lib/errors");

beforeEach(() => {
  vi.clearAllMocks();
  spaceFindFirst.mockResolvedValue({ id: "space-1" });
  spaceUpdateMany.mockResolvedValue({ count: 1 });
  assertProfileIsCompleteMock.mockResolvedValue(undefined);
});

describe("submitSpaceForReview", () => {
  it("R62: refuses to submit when the actor's own profile is incomplete, before touching the space", async () => {
    assertProfileIsCompleteMock.mockRejectedValue(new ForbiddenError("Complétez votre profil avant de publier un espace."));

    await expect(submitSpaceForReview("org-1", "space-1", "actor-1")).rejects.toBeInstanceOf(ForbiddenError);
    expect(assertProfileIsCompleteMock).toHaveBeenCalledWith("actor-1", "publier un espace");
    expect(spaceFindFirst).not.toHaveBeenCalled();
    expect(spaceUpdateMany).not.toHaveBeenCalled();
  });

  it("submits a DRAFT space once the profile is complete", async () => {
    await submitSpaceForReview("org-1", "space-1", "actor-1");
    expect(spaceUpdateMany).toHaveBeenCalledWith({
      where: { id: "space-1", organizationId: "org-1", status: { in: ["DRAFT", "REJECTED"] } },
      data: { status: "PENDING_REVIEW" },
    });
    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "space.submitted", organizationId: "org-1" })
    );
  });

  it("404s on a space from another organization", async () => {
    spaceFindFirst.mockResolvedValue(null);
    await expect(submitSpaceForReview("org-1", "space-1", "actor-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("409s on a double submit", async () => {
    spaceUpdateMany.mockResolvedValue({ count: 0 });
    await expect(submitSpaceForReview("org-1", "space-1", "actor-1")).rejects.toBeInstanceOf(ConflictError);
  });
});
