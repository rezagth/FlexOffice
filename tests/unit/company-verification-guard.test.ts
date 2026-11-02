import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
vi.mock("@/server/db/prisma", () => ({ prisma: { organizationMember: { findFirst } } }));

const { assertClientCompanyIsVerified } = await import("@/server/domains/organizations/company-verification-guard");
const { ForbiddenError } = await import("@/server/lib/errors");

const membership = (status: string) => ({ organization: { status, name: "Acme SAS" } });

beforeEach(() => vi.clearAllMocks());

describe("assertClientCompanyIsVerified (R72/R73)", () => {
  it("un particulier sans organisation n'est jamais bloqué", async () => {
    findFirst.mockResolvedValue(null);
    await expect(assertClientCompanyIsVerified("u1")).resolves.toBeUndefined();
  });

  it("une société VERIFIED peut réserver", async () => {
    findFirst.mockResolvedValue(membership("VERIFIED"));
    await expect(assertClientCompanyIsVerified("u1")).resolves.toBeUndefined();
  });

  it.each(["PENDING_VERIFICATION", "SUSPENDED"])("une société %s est refusée avec son nom dans le message", async (status) => {
    findFirst.mockResolvedValue(membership(status));
    const promise = assertClientCompanyIsVerified("u1");
    await expect(promise).rejects.toBeInstanceOf(ForbiddenError);
    await expect(promise).rejects.toThrow(/Acme SAS/);
  });

  it("ne regarde que les adhésions ACTIVES de cet utilisateur", async () => {
    findFirst.mockResolvedValue(null);
    await assertClientCompanyIsVerified("u-42");
    expect(findFirst.mock.calls[0][0].where).toEqual({ profileId: "u-42", status: "ACTIVE" });
  });
});
