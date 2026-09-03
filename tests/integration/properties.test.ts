import { beforeAll, describe, expect, it, vi } from "vitest";
import { hasDatabase } from "./helpers/should-run";
import { createTestUser, deleteTestUser, uniqueSuffix } from "./helpers/test-fixtures";

/**
 * Same mocking approach as tests/integration/verification.test.ts: only the
 * Supabase session layer is faked, so `requirePropertyOrg()` /
 * `requirePropertyManageAccess()` resolve membership, capabilities and
 * ownership against a real Postgres database.
 */
let currentSessionUserId: string | null = null;

vi.mock("@/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () =>
        currentSessionUserId
          ? { data: { user: { id: currentSessionUserId } }, error: null }
          : { data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } },
    },
  }),
}));

describe.skipIf(!hasDatabase)("Property / PropertyOwner / PropertyOperator / PropertyManager", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let becomeLandlord: typeof import("@/server/domains/organizations/become-landlord").becomeLandlord;
  let createProperty: typeof import("@/server/domains/properties/create").createProperty;
  let updateProperty: typeof import("@/server/domains/properties/update").updateProperty;
  let archiveProperty: typeof import("@/server/domains/properties/archive").archiveProperty;
  let addPropertyOwner: typeof import("@/server/domains/properties/owners").addPropertyOwner;
  let endPropertyOwner: typeof import("@/server/domains/properties/owners").endPropertyOwner;
  let addPropertyOperator: typeof import("@/server/domains/properties/operators").addPropertyOperator;
  let endPropertyOperator: typeof import("@/server/domains/properties/operators").endPropertyOperator;
  let addPropertyManager: typeof import("@/server/domains/properties/managers").addPropertyManager;
  let requirePropertyManageAccess: typeof import("@/server/domains/properties/access").requirePropertyManageAccess;
  let isCurrentOwnerOrOperator: typeof import("@/server/domains/properties/access").isCurrentOwnerOrOperator;
  let listPropertiesForOrg: typeof import("@/server/domains/properties/get").listPropertiesForOrg;
  let createSpace: typeof import("@/server/domains/organizations/create-space").createSpace;
  let ConflictError: typeof import("@/server/lib/errors").ConflictError;
  let NotFoundError: typeof import("@/server/lib/errors").NotFoundError;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
    delete process.env.OFFICEFLEX_DEMO_MODE;

    ({ prisma } = await import("@/server/db/prisma"));
    ({ becomeLandlord } = await import("@/server/domains/organizations/become-landlord"));
    ({ createProperty } = await import("@/server/domains/properties/create"));
    ({ updateProperty } = await import("@/server/domains/properties/update"));
    ({ archiveProperty } = await import("@/server/domains/properties/archive"));
    ({ addPropertyOwner, endPropertyOwner } = await import("@/server/domains/properties/owners"));
    ({ addPropertyOperator, endPropertyOperator } = await import(
      "@/server/domains/properties/operators"
    ));
    ({ addPropertyManager } = await import("@/server/domains/properties/managers"));
    ({ requirePropertyManageAccess, isCurrentOwnerOrOperator } = await import(
      "@/server/domains/properties/access"
    ));
    ({ listPropertiesForOrg } = await import("@/server/domains/properties/get"));
    ({ createSpace } = await import("@/server/domains/organizations/create-space"));
    ({ ConflictError, NotFoundError } = await import("@/server/lib/errors"));
  });

  async function actorFor(userId: string) {
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: userId } });
    const { resolveActiveContext } = await import("@/server/auth/active-context");
    const { resolveCapabilities } = await import("@/server/auth/capabilities");
    const active = await resolveActiveContext(profile);
    return {
      userId: profile.id,
      email: profile.email,
      name: profile.name,
      platformRole: profile.platformRole,
      isLandlord: profile.isLandlord,
      activeMode: active.activeMode,
      activeOrgId: active.activeOrgId,
      activeOrgRole: active.activeOrgRole,
      capabilities: resolveCapabilities({
        platformRole: profile.platformRole,
        activeMode: active.activeMode,
        isLandlord: profile.isLandlord,
        activeOrgRole: active.activeOrgRole,
      }),
      landlordContextUnavailable: active.landlordContextUnavailable,
      role: profile.role,
      organizationId: active.activeOrgId,
    };
  }

  /** Opens a landlord activity for `userId` and returns its organization —
   * becomeLandlord() sets `activeOrganizationId`, which is all
   * `requirePropertyOrg()`/capability resolution needs regardless of the
   * TENANT/LANDLORD mode flag. */
  async function landlordOrgFor(userId: string) {
    const suffix = uniqueSuffix();
    return becomeLandlord({
      actor: await actorFor(userId),
      input: {
        holderType: "INDIVIDUAL",
        activityType: "OWNER",
        address: `1 rue ${suffix}`,
        city: "Paris",
        postalCode: "75001",
      },
    });
  }

  async function requirePropertyManageAccessAs(userId: string, propertyId: string) {
    currentSessionUserId = userId;
    try {
      return await requirePropertyManageAccess(propertyId);
    } finally {
      currentSessionUserId = null;
    }
  }

  // -------------------------------------------------------------------
  // createProperty()
  // -------------------------------------------------------------------
  describe("createProperty", () => {
    it("makes the creating organization both OWNER (100%) and OPERATOR", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);

      const property = await createProperty(org.id, user.id, {
        label: "Immeuble Test",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });

      const [owners, operators] = await Promise.all([
        prisma.propertyOwner.findMany({ where: { propertyId: property.id } }),
        prisma.propertyOperator.findMany({ where: { propertyId: property.id } }),
      ]);

      expect(owners).toHaveLength(1);
      expect(owners[0].organizationId).toBe(org.id);
      expect(owners[0].ownershipShareBasisPoints).toBe(10000);
      expect(operators).toHaveLength(1);
      expect(operators[0].organizationId).toBe(org.id);

      await deleteTestUser(user.id);
    });

    it("appears in the creating organization's portfolio", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await createProperty(org.id, user.id, {
        label: "Portfolio Test",
        propertyType: "COWORKING",
        addressLine1: "2 rue de Test",
        city: "Lyon",
        postalCode: "69001",
      });

      const portfolio = await listPropertiesForOrg(org.id);
      expect(portfolio.map((p) => p.id)).toContain(property.id);

      await deleteTestUser(user.id);
    });
  });

  // -------------------------------------------------------------------
  // updateProperty() / archiveProperty()
  // -------------------------------------------------------------------
  describe("update and archive", () => {
    it("updates fields", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await createProperty(org.id, user.id, {
        label: "Before",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });

      const ctx = await actorFor(user.id);
      const updated = await updateProperty(property.id, ctx, { label: "After" });
      expect(updated.label).toBe("After");

      await deleteTestUser(user.id);
    });

    it("archives — a status flip, never a delete", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await createProperty(org.id, user.id, {
        label: "Archivable",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });

      const ctx = await actorFor(user.id);
      const archived = await archiveProperty(property.id, ctx);
      expect(archived.status).toBe("ARCHIVED");

      const stillThere = await prisma.property.findUnique({ where: { id: property.id } });
      expect(stillThere).not.toBeNull();

      await deleteTestUser(user.id);
    });
  });

  // -------------------------------------------------------------------
  // Owners — co-ownership and the 100% cap
  // -------------------------------------------------------------------
  describe("addPropertyOwner / endPropertyOwner", () => {
    it("supports several concurrent owners under 100%", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await createProperty(org.id, user.id, {
        label: "Co-owned",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });
      const ctx = await actorFor(user.id);

      // The default createProperty() owner already holds 100% — end it
      // first so two 50/50 owners can coexist, exactly like a real
      // ownership transfer/split would.
      const [defaultOwner] = await prisma.propertyOwner.findMany({ where: { propertyId: property.id } });
      await endPropertyOwner(property.id, defaultOwner.id, ctx);

      const otherUser = await createTestUser();
      await addPropertyOwner(property.id, ctx, { profileId: user.id }, 5000);
      await addPropertyOwner(property.id, ctx, { profileId: otherUser.id }, 5000);

      const activeOwners = await prisma.propertyOwner.findMany({
        where: { propertyId: property.id, endsAt: null },
      });
      expect(activeOwners).toHaveLength(2);
      expect(activeOwners.reduce((sum, o) => sum + o.ownershipShareBasisPoints, 0)).toBe(10000);

      await deleteTestUser(user.id);
      await deleteTestUser(otherUser.id);
    });

    it("refuses a share that would push the active total over 100%", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await createProperty(org.id, user.id, {
        label: "Overcommitted",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });
      const ctx = await actorFor(user.id);

      // createProperty() already committed the org's 100% — any further
      // owner, however small, must be refused while it stands.
      const otherUser = await createTestUser();
      await expect(
        addPropertyOwner(property.id, ctx, { profileId: otherUser.id }, 1)
      ).rejects.toBeInstanceOf(ConflictError);

      await deleteTestUser(user.id);
      await deleteTestUser(otherUser.id);
    });

    it("ending an owner's stake is a 409 on a second attempt, never a silent success", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await createProperty(org.id, user.id, {
        label: "Single owner",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });
      const ctx = await actorFor(user.id);
      const [owner] = await prisma.propertyOwner.findMany({ where: { propertyId: property.id } });

      await endPropertyOwner(property.id, owner.id, ctx);
      await expect(endPropertyOwner(property.id, owner.id, ctx)).rejects.toBeInstanceOf(ConflictError);

      await deleteTestUser(user.id);
    });
  });

  // -------------------------------------------------------------------
  // Operators — at most one CURRENT operator
  // -------------------------------------------------------------------
  describe("addPropertyOperator / endPropertyOperator", () => {
    it("refuses a second concurrent operator (property_operators_one_current_idx)", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await createProperty(org.id, user.id, {
        label: "One operator",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });
      const ctx = await actorFor(user.id);
      const otherUser = await createTestUser();

      // createProperty() already made the org the current operator.
      await expect(
        addPropertyOperator(property.id, ctx, { profileId: otherUser.id })
      ).rejects.toBeInstanceOf(ConflictError);

      await deleteTestUser(user.id);
      await deleteTestUser(otherUser.id);
    });

    it("allows a new operator once the previous one has ended", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await createProperty(org.id, user.id, {
        label: "Operator swap",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });
      const ctx = await actorFor(user.id);
      const [currentOperator] = await prisma.propertyOperator.findMany({
        where: { propertyId: property.id },
      });
      const otherUser = await createTestUser();

      await endPropertyOperator(property.id, currentOperator.id, ctx);
      const newOperator = await addPropertyOperator(property.id, ctx, { profileId: otherUser.id });
      expect(newOperator.profileId).toBe(otherUser.id);

      await deleteTestUser(user.id);
      await deleteTestUser(otherUser.id);
    });
  });

  // -------------------------------------------------------------------
  // Managers — never a revenue-bearing role
  // -------------------------------------------------------------------
  describe("addPropertyManager", () => {
    it("adding a manager does not make its organization a current owner or operator", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await createProperty(org.id, user.id, {
        label: "Managed",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });
      const ctx = await actorFor(user.id);
      const managerUser = await createTestUser();
      const managerOrg = await landlordOrgFor(managerUser.id);

      await addPropertyManager(property.id, ctx, { organizationId: managerOrg.id });

      expect(await isCurrentOwnerOrOperator(property.id, managerOrg.id)).toBe(false);

      await deleteTestUser(user.id);
      await deleteTestUser(managerUser.id);
    });

    it("a manager can still reach requirePropertyManageAccess (may manage, not own)", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await createProperty(org.id, user.id, {
        label: "Manager access",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });
      const ctx = await actorFor(user.id);
      const managerUser = await createTestUser();
      const managerOrg = await landlordOrgFor(managerUser.id);
      await addPropertyManager(property.id, ctx, { organizationId: managerOrg.id });

      const { ctx: resolvedCtx } = await requirePropertyManageAccessAs(managerUser.id, property.id);
      expect(resolvedCtx.userId).toBe(managerUser.id);

      await deleteTestUser(user.id);
      await deleteTestUser(managerUser.id);
    });
  });

  // -------------------------------------------------------------------
  // Authorization boundary
  // -------------------------------------------------------------------
  describe("requirePropertyManageAccess", () => {
    it("refuses (404) an organization unrelated to the property", async () => {
      const owner = await createTestUser();
      const org = await landlordOrgFor(owner.id);
      const property = await createProperty(org.id, owner.id, {
        label: "Private",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });

      const stranger = await createTestUser();
      await landlordOrgFor(stranger.id);

      await expect(
        requirePropertyManageAccessAs(stranger.id, property.id)
      ).rejects.toBeInstanceOf(NotFoundError);

      await deleteTestUser(owner.id);
      await deleteTestUser(stranger.id);
    });

    it("a TENANT-only account (no landlord activity at all) is refused", async () => {
      const owner = await createTestUser();
      const org = await landlordOrgFor(owner.id);
      const property = await createProperty(org.id, owner.id, {
        label: "Tenant refused",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });

      const tenant = await createTestUser();

      await expect(requirePropertyManageAccessAs(tenant.id, property.id)).rejects.toBeInstanceOf(
        NotFoundError
      );

      await deleteTestUser(owner.id);
      await deleteTestUser(tenant.id);
    });

    it("a platform administrator bypasses the ownership check", async () => {
      const owner = await createTestUser();
      const org = await landlordOrgFor(owner.id);
      const property = await createProperty(org.id, owner.id, {
        label: "Admin visible",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });

      const admin = await createTestUser();
      await prisma.profile.update({ where: { id: admin.id }, data: { platformRole: "ADMIN" } });

      const { ctx } = await requirePropertyManageAccessAs(admin.id, property.id);
      expect(ctx.userId).toBe(admin.id);

      await deleteTestUser(owner.id);
      await deleteTestUser(admin.id);
    });

    it("answers 404 for an unknown property id", async () => {
      const user = await createTestUser();
      await expect(
        requirePropertyManageAccessAs(user.id, "00000000-0000-0000-0000-000000000000")
      ).rejects.toBeInstanceOf(NotFoundError);
      await deleteTestUser(user.id);
    });
  });

  // -------------------------------------------------------------------
  // Space <-> Property coherence
  // -------------------------------------------------------------------
  describe("createSpace() property coherence", () => {
    it("creates a space under a property the organization owns", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await createProperty(org.id, user.id, {
        label: "Buildable",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });

      const space = await createSpace(org.id, {
        propertyId: property.id,
        name: "Salle A",
        type: "MEETING_ROOM",
        description: "Fixture",
        address: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
        capacity: 4,
        amenities: [],
        halfDayPriceCents: 5000,
        dayPriceCents: 9000,
      });

      expect(space.propertyId).toBe(property.id);
      expect(space.organizationId).toBe(org.id);

      // Before deleteTestUser(): spaces.property_id is ON DELETE RESTRICT,
      // so the property (and this space) must go first.
      await prisma.space.delete({ where: { id: space.id } });
      await deleteTestUser(user.id);
    });

    it("refuses a space under a property belonging to a different organization", async () => {
      const owner = await createTestUser();
      const org = await landlordOrgFor(owner.id);
      const property = await createProperty(org.id, owner.id, {
        label: "Not yours",
        propertyType: "OFFICE",
        addressLine1: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
      });

      const otherUser = await createTestUser();
      const otherOrg = await landlordOrgFor(otherUser.id);

      await expect(
        createSpace(otherOrg.id, {
          propertyId: property.id,
          name: "Salle B",
          type: "MEETING_ROOM",
          description: "Fixture",
          address: "1 rue de Test",
          city: "Paris",
          postalCode: "75001",
          capacity: 4,
          amenities: [],
          halfDayPriceCents: 5000,
          dayPriceCents: 9000,
        })
      ).rejects.toBeInstanceOf(NotFoundError);

      await deleteTestUser(owner.id);
      await deleteTestUser(otherUser.id);
    });
  });
});
