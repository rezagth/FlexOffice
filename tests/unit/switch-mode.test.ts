import { beforeEach, describe, expect, it, vi } from "vitest";

const profileUpdateMock = vi.fn();
const memberFindFirstMock = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    profile: { update: profileUpdateMock },
    organizationMember: { findFirst: memberFindFirstMock },
  },
}));

const { switchMode } = await import("@/server/domains/users/switch-mode");
const { switchModeSchema } = await import("@/lib/validation/landlord");

/**
 * The tenant / landlord switch.
 *
 * Two things are being asserted, and they are the acceptance criteria of the
 * phase: a plain tenant cannot enter landlord mode by asking, and nobody can
 * select an organization they are not a member of.
 */
type Actor = Parameters<typeof switchMode>[0]["actor"];

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    userId: "u1",
    email: "a@b.com",
    name: "Alice",
    platformRole: "USER",
    isLandlord: false,
    activeMode: "TENANT",
    activeOrgId: null,
    activeOrgRole: null,
    capabilities: new Set(),
    landlordContextUnavailable: false,
    role: "CLIENT",
    organizationId: null,
    ...overrides,
  } as Actor;
}

const landlordActor = actor({
  isLandlord: true,
  activeMode: "TENANT",
  activeOrgId: "org-a",
  activeOrgRole: "OWNER",
});

beforeEach(() => {
  profileUpdateMock.mockReset();
  profileUpdateMock.mockResolvedValue({});
  memberFindFirstMock.mockReset();
  memberFindFirstMock.mockResolvedValue(null);
});

function membership(organizationId: string, orgRole = "OWNER") {
  return {
    organizationId,
    orgRole,
    organization: { name: `Org ${organizationId}` },
  };
}

describe("switchMode — TENANT -> LANDLORD", () => {
  it("refuses an account that has not opened a letting activity", async () => {
    await expect(
      switchMode({ actor: actor(), input: { mode: "LANDLORD" } })
    ).rejects.toMatchObject({ status: 403 });

    // Nothing written: a refused switch must not leave a half-applied state.
    expect(profileUpdateMock).not.toHaveBeenCalled();
  });

  it("refuses even when the caller also sends an organization id", async () => {
    // The obvious bypass attempt: supply the target directly.
    memberFindFirstMock.mockResolvedValue(membership("org-a"));
    await expect(
      switchMode({
        actor: actor(),
        input: { mode: "LANDLORD", organizationId: "org-a" },
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(profileUpdateMock).not.toHaveBeenCalled();
  });

  it("allows a landlord with an ACTIVE membership", async () => {
    memberFindFirstMock.mockResolvedValue(membership("org-a"));

    await expect(
      switchMode({ actor: landlordActor, input: { mode: "LANDLORD" } })
    ).resolves.toEqual({ activeMode: "LANDLORD", activeOrgId: "org-a" });

    expect(profileUpdateMock).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { activeMode: "LANDLORD", activeOrganizationId: "org-a" },
    });
  });

  it("refuses an organization the caller is not a member of", async () => {
    // The central isolation test: knowing an id grants nothing.
    memberFindFirstMock.mockResolvedValue(null);

    await expect(
      switchMode({
        actor: landlordActor,
        input: { mode: "LANDLORD", organizationId: "org-someone-else" },
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(profileUpdateMock).not.toHaveBeenCalled();
  });

  it("checks the membership of the REQUESTED organization, not the stored one", async () => {
    memberFindFirstMock.mockResolvedValue(null);

    await expect(
      switchMode({
        actor: landlordActor, // stored org-a, which is valid
        input: { mode: "LANDLORD", organizationId: "org-b" },
      })
    ).rejects.toMatchObject({ status: 403 });

    // Proof it looked up the target rather than trusting the resolved context.
    expect(memberFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          profileId: "u1",
          organizationId: "org-b",
          status: "ACTIVE",
        }),
      })
    );
  });

  it("only accepts an ACTIVE membership", async () => {
    // An INVITED member has not accepted; a REVOKED one is gone. The query
    // filters on status, so a non-active row returns null here.
    memberFindFirstMock.mockImplementation(async ({ where }) =>
      where.status === "ACTIVE" ? null : membership("org-a")
    );

    await expect(
      switchMode({ actor: landlordActor, input: { mode: "LANDLORD" } })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a landlord with no organization at all", async () => {
    await expect(
      switchMode({
        actor: actor({ isLandlord: true, activeOrgId: null }),
        input: { mode: "LANDLORD" },
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("switches to the role actually held, not one the caller names", async () => {
    // The payload has no place for a role, and the stored value comes from
    // the membership row.
    memberFindFirstMock.mockResolvedValue(membership("org-a", "VIEWER"));

    const result = await switchMode({
      actor: landlordActor,
      input: { mode: "LANDLORD" },
    });
    expect(result.activeOrgId).toBe("org-a");
    // The role is never written to the profile — capabilities are resolved
    // per request from the membership.
    expect(profileUpdateMock.mock.calls[0][0].data).not.toHaveProperty("activeOrgRole");
  });
});

describe("switchMode — LANDLORD -> TENANT", () => {
  it("is always allowed", async () => {
    // Every account can rent a space, so there is nothing to check.
    await expect(
      switchMode({
        actor: actor({ isLandlord: true, activeMode: "LANDLORD", activeOrgId: "org-a" }),
        input: { mode: "TENANT" },
      })
    ).resolves.toEqual({ activeMode: "TENANT", activeOrgId: "org-a" });
  });

  it("keeps the organization selection so switching back returns to it", async () => {
    await switchMode({
      actor: actor({ isLandlord: true, activeMode: "LANDLORD", activeOrgId: "org-a" }),
      input: { mode: "TENANT" },
    });
    expect(profileUpdateMock).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { activeMode: "TENANT" },
    });
  });

  it("does not consult the membership table at all", async () => {
    await switchMode({ actor: landlordActor, input: { mode: "TENANT" } });
    expect(memberFindFirstMock).not.toHaveBeenCalled();
  });

  it("works for a tenant-only account (a no-op switch)", async () => {
    await expect(
      switchMode({ actor: actor(), input: { mode: "TENANT" } })
    ).resolves.toMatchObject({ activeMode: "TENANT" });
  });
});

describe("switchModeSchema", () => {
  it("accepts the two modes only", () => {
    expect(switchModeSchema.safeParse({ mode: "TENANT" }).success).toBe(true);
    expect(switchModeSchema.safeParse({ mode: "LANDLORD" }).success).toBe(true);
    expect(switchModeSchema.safeParse({ mode: "ADMIN" }).success).toBe(false);
    expect(switchModeSchema.safeParse({ mode: "OWNER" }).success).toBe(false);
  });

  it("rejects a non-uuid organization id", () => {
    expect(
      switchModeSchema.safeParse({ mode: "LANDLORD", organizationId: "not-a-uuid" })
        .success
    ).toBe(false);
  });

  it("has no field through which a role or a capability could be supplied", () => {
    // Authorization never arrives in a request body. Unknown keys are
    // stripped by Zod, so smuggling one has no effect.
    const parsed = switchModeSchema.parse({
      mode: "TENANT",
      orgRole: "OWNER",
      platformRole: "ADMIN",
      capabilities: ["admin:access_backoffice"],
      isLandlord: true,
    } as unknown);
    expect(Object.keys(parsed)).toEqual(["mode"]);
  });
});
