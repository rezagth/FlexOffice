import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCapability = vi.fn();
const logEvent = vi.fn();
vi.mock("@/server/auth/rbac", () => ({ requireCapability }));
vi.mock("@/server/lib/logger", () => ({ logEvent, logError: vi.fn() }));

const { requireOrgCapability } = await import("@/server/domains/organizations/require-org-capability");
const { ForbiddenError } = await import("@/server/lib/errors");

beforeEach(() => vi.clearAllMocks());

describe("requireOrgCapability", () => {
  it("demande la capacité exacte, pas un simple rôle", async () => {
    requireCapability.mockResolvedValue({ userId: "u", activeOrgId: "o" });
    await requireOrgCapability("landlord:manage_bookings");
    expect(requireCapability).toHaveBeenCalledWith("landlord:manage_bookings");
  });

  it("expose l'organisation issue de la session sous deux noms identiques", async () => {
    requireCapability.mockResolvedValue({ userId: "u", activeOrgId: "org-9" });
    const ctx = await requireOrgCapability("landlord:manage_spaces");
    expect(ctx.organizationId).toBe("org-9");
    expect(ctx.activeOrgId).toBe("org-9");
  });

  it("propage le refus de requireCapability (membre sans droit)", async () => {
    requireCapability.mockRejectedValue(new ForbiddenError());
    await expect(requireOrgCapability("landlord:manage_bookings")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuse et journalise un contexte sans organisation active", async () => {
    requireCapability.mockResolvedValue({ userId: "u", activeOrgId: null });
    await expect(requireOrgCapability("landlord:manage_spaces")).rejects.toBeInstanceOf(ForbiddenError);
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "authz.denied", reason: "no_organization" }));
  });

  it("une chaîne vide n'est pas une organisation", async () => {
    requireCapability.mockResolvedValue({ userId: "u", activeOrgId: "" });
    await expect(requireOrgCapability("landlord:manage_spaces")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
