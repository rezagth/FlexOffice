import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasRealBackend } from "./helpers/should-run";

const deleteUser = vi.fn();
const updateUserById = vi.fn();

// Supabase Auth admin calls are stubbed: the point of this test is which
// database branch runs (hard delete vs anonymize), which is decided by the
// ON DELETE RESTRICT foreign key on bookings — a real database concern.
vi.mock("@/server/auth/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { deleteUser, updateUserById } },
  }),
}));

describe.skipIf(!hasRealBackend)("GDPR account deletion", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let deleteOrAnonymizeProfile: typeof import("@/server/domains/users/gdpr").deleteOrAnonymizeProfile;
  let exportProfileData: typeof import("@/server/domains/users/gdpr").exportProfileData;

  let orgId: string;
  let propertyId: string;
  let spaceId: string;
  let withBookingsUserId: string;
  let cleanUserId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    ({ deleteOrAnonymizeProfile, exportProfileData } = await import(
      "@/server/domains/users/gdpr"
    ));

    deleteUser.mockResolvedValue({ error: null });
    updateUserById.mockResolvedValue({ error: null });

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    withBookingsUserId = crypto.randomUUID();
    cleanUserId = crypto.randomUUID();
    for (const [id, label] of [
      [withBookingsUserId, "with-bookings"],
      [cleanUserId, "clean"],
    ] as const) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`,
        id,
        `gdpr-${label}-${suffix}@test.local`,
        JSON.stringify({ role: "CLIENT", name: `GDPR ${label}` })
      );
    }

    const org = await prisma.organization.create({
      data: {
        name: `GDPR Org ${suffix}`,
        siret: String(Date.now()).padEnd(14, "7").slice(0, 14),
        email: `gdpr-org-${suffix}@test.local`,
        address: "1 rue Test",
        city: "Paris",
        postalCode: "75001",
      },
    });
    orgId = org.id;

    const property = await prisma.property.create({
      data: {
        label: "GDPR Property",
        propertyType: "OFFICE",
        addressLine1: "1 rue Test",
        city: "Paris",
        postalCode: "75001",
        // withBookingsUserId, never cleanUserId: this test's whole point is
        // that cleanUserId has NO history and takes the hard-delete branch
        // — giving it a Property to its name would falsify that fixture.
        createdByProfileId: withBookingsUserId,
        owners: { create: { organizationId: orgId, ownershipShareBasisPoints: 10000 } },
        operators: { create: { organizationId: orgId } },
      },
    });
    propertyId = property.id;

    const space = await prisma.space.create({
      data: {
        propertyId,
        organizationId: orgId,
        slug: `gdpr-space-${suffix}`,
        name: "GDPR Space",
        type: "MEETING_ROOM",
        description: "Used by GDPR tests",
        address: "1 rue Test",
        city: "Paris",
        postalCode: "75001",
        capacity: 4,
        amenities: [],
        photos: [],
        halfDayPriceCents: 5000,
        dayPriceCents: 9000,
        status: "PUBLISHED",
      },
    });
    spaceId = space.id;

    await prisma.booking.create({
      data: {
        spaceId,
        organizationId: orgId,
        clientUserId: withBookingsUserId,
        startsAt: new Date("2031-08-04T09:00:00Z"),
        endsAt: new Date("2031-08-04T12:00:00Z"),
        status: "COMPLETED",
        participantsCount: 2,
        purpose: "Historique conservé",
        priceAmountCents: 5000,
        commissionAmountCents: 750,
      },
    });
  });

  afterAll(async () => {
    // Guard every id: if beforeAll failed partway these are undefined, and
    // Prisma reads `where: { id: undefined }` as "no filter" — deleting
    // every row in the table rather than this test's own.
    if (orgId) {
      await prisma.booking.deleteMany({ where: { organizationId: orgId } });
      await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    }
    if (spaceId) await prisma.space.deleteMany({ where: { id: spaceId } });
    if (propertyId) await prisma.property.deleteMany({ where: { id: propertyId } });
    if (orgId) await prisma.organization.deleteMany({ where: { id: orgId } });
    const authIds = [withBookingsUserId, cleanUserId].filter(Boolean);
    if (authIds.length > 0) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM auth.users WHERE id = ANY($1::uuid[])`,
        authIds
      );
    }
    await prisma.$disconnect();
  });

  it("exports the caller's own profile and bookings", async () => {
    const data = await exportProfileData(withBookingsUserId);
    expect(data.profile.id).toBe(withBookingsUserId);
    expect(data.bookings).toHaveLength(1);
  });

  it("anonymizes — never deletes — an account that has bookings", async () => {
    const result = await deleteOrAnonymizeProfile(withBookingsUserId);
    expect(result.mode).toBe("anonymized");

    const profile = await prisma.profile.findUnique({ where: { id: withBookingsUserId } });
    expect(profile).not.toBeNull();
    expect(profile?.name).toBe("Compte supprimé");
    expect(profile?.email).toMatch(/@officeflex\.invalid$/);
    expect(profile?.phone).toBeNull();
    expect(profile?.deletedAt).not.toBeNull();

    // The booking itself is retained for accounting purposes.
    const bookings = await prisma.booking.count({ where: { clientUserId: withBookingsUserId } });
    expect(bookings).toBe(1);

    // Sign-in is blocked rather than the auth user being removed.
    expect(updateUserById).toHaveBeenCalledWith(
      withBookingsUserId,
      expect.objectContaining({ ban_duration: expect.any(String) })
    );
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("hard-deletes an account with no booking history", async () => {
    const result = await deleteOrAnonymizeProfile(cleanUserId);
    expect(result.mode).toBe("hard_delete");
    expect(deleteUser).toHaveBeenCalledWith(cleanUserId);
  });

  /**
   * Phase 3 regression test. `landlord_verifications.requested_by_profile_id`
   * and `organization_members.profile_id` are both ON DELETE RESTRICT (an
   * organization or a review decision must not silently lose who it belongs
   * to). Before this fix, an account that had opened a letting activity but
   * had ZERO bookings would take the hard-delete branch — bookingCount is 0
   * — cascade from auth.users into profiles, and then fail with a raw
   * foreign-key error instead of the clean GDPR flow.
   */
  it("anonymizes — never hard-deletes — a landlord account with zero bookings", async () => {
    const { becomeLandlord } = await import(
      "@/server/domains/organizations/become-landlord"
    );
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const landlordUserId = crypto.randomUUID();

    await prisma.$executeRawUnsafe(
      `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`,
      landlordUserId,
      `gdpr-landlord-${suffix}@test.local`,
      JSON.stringify({ role: "CLIENT", name: "GDPR Landlord" })
    );

    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: landlordUserId } });
    const organization = await becomeLandlord({
      actor: {
        userId: profile.id,
        email: profile.email,
        name: profile.name,
        platformRole: profile.platformRole,
        isLandlord: profile.isLandlord,
        activeMode: profile.activeMode,
        activeOrgId: null,
        activeOrgRole: null,
        capabilities: new Set(),
        landlordContextUnavailable: false,
        role: profile.role,
        organizationId: null,
      },
      input: {
        holderType: "INDIVIDUAL",
        activityType: "OWNER",
        address: "1 rue Test",
        city: "Paris",
        postalCode: "75001",
      },
    });

    deleteUser.mockClear();
    updateUserById.mockClear();

    // The whole point: this must not throw a raw Postgres FK error.
    const result = await deleteOrAnonymizeProfile(landlordUserId);
    expect(result.mode).toBe("anonymized");

    const anonymized = await prisma.profile.findUniqueOrThrow({ where: { id: landlordUserId } });
    expect(anonymized.deletedAt).not.toBeNull();
    expect(anonymized.email).toMatch(/@officeflex\.invalid$/);

    // The organization and its dossier survive, still pointing at the now
    // tombstoned profile.
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: organization.id, profileId: landlordUserId },
    });
    expect(membership).not.toBeNull();
    const verification = await prisma.landlordVerification.findFirst({
      where: { organizationId: organization.id },
    });
    expect(verification?.requestedByProfileId).toBe(landlordUserId);

    expect(deleteUser).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalledWith(
      landlordUserId,
      expect.objectContaining({ ban_duration: expect.any(String) })
    );

    // Cleanup: this user was not created via beforeAll, so afterAll's
    // guarded cleanup does not know about it.
    await prisma.landlordVerification.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organizationMember.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organization.deleteMany({ where: { id: organization.id } });
    await prisma.$executeRawUnsafe(`DELETE FROM auth.users WHERE id = $1`, landlordUserId);
  });
});
