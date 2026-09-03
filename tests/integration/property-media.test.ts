import { beforeAll, describe, expect, it, vi } from "vitest";
import { hasDatabase } from "./helpers/should-run";
import { createTestUser, deleteTestUser, uniqueSuffix } from "./helpers/test-fixtures";

/**
 * DB-level behavior for property/space photos, amenities, multi-slot hours
 * and archiving — everything that does NOT require a real Supabase Storage
 * upload. The upload/delete round trip itself (which needs real Storage)
 * is covered separately, gated behind `hasSupabase`, mirroring
 * verification-storage.test.ts's split from verification.test.ts in
 * Phase 3.
 *
 * Same session-mocking approach as properties.test.ts: only the Supabase
 * session layer is faked, so authorization resolves against a real
 * Postgres database.
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

describe.skipIf(!hasDatabase)("Phase 5 — property/space media, amenities, hours, archiving", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let becomeLandlord: typeof import("@/server/domains/organizations/become-landlord").becomeLandlord;
  let createProperty: typeof import("@/server/domains/properties/create").createProperty;
  let createSpace: typeof import("@/server/domains/organizations/create-space").createSpace;
  let setPrimaryPropertyPhoto: typeof import("@/server/domains/properties/photos").setPrimaryPropertyPhoto;
  let reorderPropertyPhotos: typeof import("@/server/domains/properties/photos").reorderPropertyPhotos;
  let setPrimarySpacePhoto: typeof import("@/server/domains/properties/space-photos").setPrimarySpacePhoto;
  let reorderSpacePhotos: typeof import("@/server/domains/properties/space-photos").reorderSpacePhotos;
  let archiveSpace: typeof import("@/server/domains/properties/spaces").archiveSpace;
  let requireSpaceManageAccess: typeof import("@/server/domains/properties/spaces").requireSpaceManageAccess;
  let replaceOpeningHours: typeof import("@/server/domains/organizations/opening-hours").replaceOpeningHours;
  let ValidationError: typeof import("@/server/lib/errors").ValidationError;
  let NotFoundError: typeof import("@/server/lib/errors").NotFoundError;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
    delete process.env.OFFICEFLEX_DEMO_MODE;

    ({ prisma } = await import("@/server/db/prisma"));
    ({ becomeLandlord } = await import("@/server/domains/organizations/become-landlord"));
    ({ createProperty } = await import("@/server/domains/properties/create"));
    ({ createSpace } = await import("@/server/domains/organizations/create-space"));
    ({ setPrimaryPropertyPhoto, reorderPropertyPhotos } = await import(
      "@/server/domains/properties/photos"
    ));
    ({ setPrimarySpacePhoto, reorderSpacePhotos } = await import(
      "@/server/domains/properties/space-photos"
    ));
    ({ archiveSpace, requireSpaceManageAccess } = await import("@/server/domains/properties/spaces"));
    ({ replaceOpeningHours } = await import("@/server/domains/organizations/opening-hours"));
    ({ ValidationError, NotFoundError } = await import("@/server/lib/errors"));
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

  async function propertyFor(userId: string, orgId: string) {
    return createProperty(orgId, userId, {
      label: `Test Property ${uniqueSuffix()}`,
      propertyType: "OFFICE",
      addressLine1: "1 rue de Test",
      city: "Paris",
      postalCode: "75001",
    });
  }

  /** Inserts a photo row directly — standing in for a real upload, which
   * verification-storage.test.ts-style tests cover separately behind
   * hasSupabase. */
  async function fixturePropertyPhoto(propertyId: string, overrides: { isPrimary?: boolean } = {}) {
    return prisma.propertyPhoto.create({
      data: {
        propertyId,
        storagePath: `properties/${propertyId}/${crypto.randomUUID()}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 12345,
        isPrimary: overrides.isPrimary ?? false,
      },
    });
  }

  async function fixtureSpacePhoto(spaceId: string, overrides: { isPrimary?: boolean } = {}) {
    return prisma.spacePhoto.create({
      data: {
        spaceId,
        storagePath: `spaces/${spaceId}/${crypto.randomUUID()}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 12345,
        isPrimary: overrides.isPrimary ?? false,
      },
    });
  }

  describe("primary photo — at most one per entity", () => {
    it("the database itself refuses two PRIMARY photos on the same property", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await propertyFor(user.id, org.id);

      await fixturePropertyPhoto(property.id, { isPrimary: true });
      await expect(fixturePropertyPhoto(property.id, { isPrimary: true })).rejects.toThrow(
        /property_photos_one_primary_idx/
      );

      await deleteTestUser(user.id);
    });

    it("the database itself refuses two PRIMARY photos on the same space", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await propertyFor(user.id, org.id);
      const space = await createSpace(org.id, {
        propertyId: property.id,
        name: "Salle",
        type: "MEETING_ROOM",
        description: "Fixture",
        address: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
        capacity: 4,
        amenities: ["WIFI"],
        halfDayPriceCents: 5000,
        dayPriceCents: 9000,
      });

      await fixtureSpacePhoto(space.id, { isPrimary: true });
      await expect(fixtureSpacePhoto(space.id, { isPrimary: true })).rejects.toThrow(
        /space_photos_one_primary_idx/
      );

      await prisma.space.deleteMany({ where: { id: space.id } });
      await deleteTestUser(user.id);
    });

    it("setPrimaryPropertyPhoto() moves the flag rather than duplicating it", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await propertyFor(user.id, org.id);
      const first = await fixturePropertyPhoto(property.id, { isPrimary: true });
      const second = await fixturePropertyPhoto(property.id);
      const ctx = await actorFor(user.id);

      await setPrimaryPropertyPhoto(property.id, second.id, ctx);

      const photos = await prisma.propertyPhoto.findMany({ where: { propertyId: property.id } });
      const primaries = photos.filter((p) => p.isPrimary);
      expect(primaries).toHaveLength(1);
      expect(primaries[0].id).toBe(second.id);
      expect(photos.find((p) => p.id === first.id)?.isPrimary).toBe(false);

      await deleteTestUser(user.id);
    });
  });

  describe("reorderPropertyPhotos / reorderSpacePhotos", () => {
    it("applies the given order as position", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await propertyFor(user.id, org.id);
      const a = await fixturePropertyPhoto(property.id, { isPrimary: true });
      const b = await fixturePropertyPhoto(property.id);
      const ctx = await actorFor(user.id);

      await reorderPropertyPhotos(property.id, [b.id, a.id], ctx);

      const photos = await prisma.propertyPhoto.findMany({
        where: { propertyId: property.id },
        orderBy: { position: "asc" },
      });
      expect(photos.map((p) => p.id)).toEqual([b.id, a.id]);

      await deleteTestUser(user.id);
    });

    it("refuses a list that does not match this property's own photos exactly", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await propertyFor(user.id, org.id);
      const a = await fixturePropertyPhoto(property.id, { isPrimary: true });
      const ctx = await actorFor(user.id);

      await expect(
        reorderPropertyPhotos(property.id, [a.id, "00000000-0000-0000-0000-000000000000"], ctx)
      ).rejects.toBeInstanceOf(ValidationError);

      await deleteTestUser(user.id);
    });

    it("reorderSpacePhotos() applies the given order as position", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await propertyFor(user.id, org.id);
      const space = await createSpace(org.id, {
        propertyId: property.id,
        name: "Salle photos",
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
      const a = await fixtureSpacePhoto(space.id, { isPrimary: true });
      const b = await fixtureSpacePhoto(space.id);
      const ctx = await actorFor(user.id);

      await reorderSpacePhotos(space.id, [b.id, a.id], ctx);

      const photos = await prisma.spacePhoto.findMany({
        where: { spaceId: space.id },
        orderBy: { position: "asc" },
      });
      expect(photos.map((p) => p.id)).toEqual([b.id, a.id]);

      await prisma.space.deleteMany({ where: { id: space.id } });
      await deleteTestUser(user.id);
    });

    it("setPrimarySpacePhoto() moves the flag rather than duplicating it", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await propertyFor(user.id, org.id);
      const space = await createSpace(org.id, {
        propertyId: property.id,
        name: "Salle primaire",
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
      const first = await fixtureSpacePhoto(space.id, { isPrimary: true });
      const second = await fixtureSpacePhoto(space.id);
      const ctx = await actorFor(user.id);

      await setPrimarySpacePhoto(space.id, second.id, ctx);

      const photos = await prisma.spacePhoto.findMany({ where: { spaceId: space.id } });
      const primaries = photos.filter((p) => p.isPrimary);
      expect(primaries).toHaveLength(1);
      expect(primaries[0].id).toBe(second.id);
      expect(photos.find((p) => p.id === first.id)?.isPrimary).toBe(false);

      await prisma.space.deleteMany({ where: { id: space.id } });
      await deleteTestUser(user.id);
    });
  });

  describe("amenities — controlled vocabulary", () => {
    it("stores only enum values, queryable back", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await propertyFor(user.id, org.id);
      const space = await createSpace(org.id, {
        propertyId: property.id,
        name: "Salle équipée",
        type: "MEETING_ROOM",
        description: "Fixture",
        address: "1 rue de Test",
        city: "Paris",
        postalCode: "75001",
        capacity: 4,
        amenities: ["WIFI", "PROJECTOR", "COFFEE"],
        halfDayPriceCents: 5000,
        dayPriceCents: 9000,
      });

      const reloaded = await prisma.space.findUniqueOrThrow({ where: { id: space.id } });
      expect(reloaded.amenities.sort()).toEqual(["COFFEE", "PROJECTOR", "WIFI"]);

      await prisma.space.deleteMany({ where: { id: space.id } });
      await deleteTestUser(user.id);
    });
  });

  describe("opening hours — multiple slots per weekday", () => {
    it("stores a morning and an afternoon slot on the same weekday", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await propertyFor(user.id, org.id);
      const space = await createSpace(org.id, {
        propertyId: property.id,
        name: "Salle horaires",
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

      await replaceOpeningHours(org.id, space.id, [
        { weekday: 1, opensAt: "09:00", closesAt: "12:00" },
        { weekday: 1, opensAt: "14:00", closesAt: "18:00" },
      ]);

      const hours = await prisma.spaceOpeningHours.findMany({
        where: { spaceId: space.id },
        orderBy: { opensAt: "asc" },
      });
      expect(hours).toHaveLength(2);
      expect(hours[0].closesAt).toBe("12:00");
      expect(hours[1].opensAt).toBe("14:00");

      await prisma.space.deleteMany({ where: { id: space.id } });
      await deleteTestUser(user.id);
    });
  });

  describe("archiveSpace via Property-derived access", () => {
    it("flips status to ARCHIVED without deleting the row", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await propertyFor(user.id, org.id);
      const space = await createSpace(org.id, {
        propertyId: property.id,
        name: "Salle à archiver",
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
      const ctx = await actorFor(user.id);

      const archived = await archiveSpace(space.id, ctx);
      expect(archived.status).toBe("ARCHIVED");

      const stillThere = await prisma.space.findUnique({ where: { id: space.id } });
      expect(stillThere).not.toBeNull();

      await prisma.space.deleteMany({ where: { id: space.id } });
      await deleteTestUser(user.id);
    });
  });

  describe("requireSpaceManageAccess — Property-derived, not organizationId", () => {
    it("allows the owning organization", async () => {
      const user = await createTestUser();
      const org = await landlordOrgFor(user.id);
      const property = await propertyFor(user.id, org.id);
      const space = await createSpace(org.id, {
        propertyId: property.id,
        name: "Salle accessible",
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

      currentSessionUserId = user.id;
      const { ctx } = await requireSpaceManageAccess(space.id);
      currentSessionUserId = null;
      expect(ctx.userId).toBe(user.id);

      await prisma.space.deleteMany({ where: { id: space.id } });
      await deleteTestUser(user.id);
    });

    it("refuses (404) an unrelated organization", async () => {
      const owner = await createTestUser();
      const org = await landlordOrgFor(owner.id);
      const property = await propertyFor(owner.id, org.id);
      const space = await createSpace(org.id, {
        propertyId: property.id,
        name: "Salle privée",
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

      const stranger = await createTestUser();
      await landlordOrgFor(stranger.id);

      currentSessionUserId = stranger.id;
      await expect(requireSpaceManageAccess(space.id)).rejects.toBeInstanceOf(NotFoundError);
      currentSessionUserId = null;

      await prisma.space.deleteMany({ where: { id: space.id } });
      await deleteTestUser(owner.id);
      await deleteTestUser(stranger.id);
    });

    it("refuses a plain tenant with no landlord activity at all", async () => {
      const owner = await createTestUser();
      const org = await landlordOrgFor(owner.id);
      const property = await propertyFor(owner.id, org.id);
      const space = await createSpace(org.id, {
        propertyId: property.id,
        name: "Salle tenant",
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

      const tenant = await createTestUser();

      currentSessionUserId = tenant.id;
      await expect(requireSpaceManageAccess(space.id)).rejects.toBeInstanceOf(NotFoundError);
      currentSessionUserId = null;

      await prisma.space.deleteMany({ where: { id: space.id } });
      await deleteTestUser(owner.id);
      await deleteTestUser(tenant.id);
    });
  });
});
