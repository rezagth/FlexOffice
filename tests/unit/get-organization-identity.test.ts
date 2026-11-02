import { beforeEach, describe, expect, it, vi } from "vitest";

const memberFindMany = vi.fn();
const verifFindMany = vi.fn();
vi.mock("@/server/db/prisma", () => ({
  prisma: { organizationMember: { findMany: memberFindMany }, landlordVerification: { findMany: verifFindMany } },
}));

const { listOrganizationIdentitiesForProfile } = await import(
  "@/server/domains/organizations/get-organization-identity"
);

const org = (id: string) => ({
  id,
  name: `Org ${id}`,
  holderType: "COMPANY",
  status: "VERIFIED",
  siret: "12345678901234",
  legalName: `Org ${id} SAS`,
});

beforeEach(() => vi.clearAllMocks());

describe("listOrganizationIdentitiesForProfile", () => {
  it("aucune adhésion → liste vide, sans requête de vérification", async () => {
    memberFindMany.mockResolvedValue([]);
    expect(await listOrganizationIdentitiesForProfile("p1")).toEqual([]);
    expect(verifFindMany).not.toHaveBeenCalled();
  });

  it("ne lit que les adhésions ACTIVES du profil demandé", async () => {
    memberFindMany.mockResolvedValue([]);
    await listOrganizationIdentitiesForProfile("p-77");
    expect(memberFindMany.mock.calls[0][0].where).toEqual({ profileId: "p-77", status: "ACTIVE" });
  });

  it("joint le rôle d'organisation et le statut du dossier le plus récent", async () => {
    memberFindMany.mockResolvedValue([{ orgRole: "OWNER", organization: org("a") }]);
    verifFindMany.mockResolvedValue([
      { organizationId: "a", status: "APPROVED" },
      { organizationId: "a", status: "REJECTED" },
    ]);
    const [row] = await listOrganizationIdentitiesForProfile("p1");
    expect(row.orgRole).toBe("OWNER");
    expect(row.verificationStatus).toBe("APPROVED");
  });

  it("une organisation sans dossier a un statut de vérification nul", async () => {
    memberFindMany.mockResolvedValue([{ orgRole: "ADMIN", organization: org("a") }]);
    verifFindMany.mockResolvedValue([]);
    const [row] = await listOrganizationIdentitiesForProfile("p1");
    expect(row.verificationStatus).toBeNull();
  });

  it("n'attribue pas à une organisation le dossier d'une autre", async () => {
    memberFindMany.mockResolvedValue([
      { orgRole: "OWNER", organization: org("a") },
      { orgRole: "VIEWER", organization: org("b") },
    ]);
    verifFindMany.mockResolvedValue([{ organizationId: "b", status: "PENDING_REVIEW" }]);
    const rows = await listOrganizationIdentitiesForProfile("p1");
    expect(rows.find((r) => r.id === "a")?.verificationStatus).toBeNull();
    expect(rows.find((r) => r.id === "b")?.verificationStatus).toBe("PENDING_REVIEW");
  });

  it("interroge les dossiers en une seule requête pour toutes les organisations", async () => {
    memberFindMany.mockResolvedValue([
      { orgRole: "OWNER", organization: org("a") },
      { orgRole: "OWNER", organization: org("b") },
      { orgRole: "OWNER", organization: org("c") },
    ]);
    verifFindMany.mockResolvedValue([]);
    await listOrganizationIdentitiesForProfile("p1");
    expect(verifFindMany).toHaveBeenCalledTimes(1);
    expect(verifFindMany.mock.calls[0][0].where.organizationId.in).toEqual(["a", "b", "c"]);
  });
});
