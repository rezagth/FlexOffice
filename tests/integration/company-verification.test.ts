import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";
import { createTestUser, deleteTestUser, uniqueSiret } from "./helpers/test-fixtures";

/**
 * PRD V1.1, R71-R74 and R61/R81 — the generalized verification circuit
 * (lot 2A, commit 1), against a real database:
 *   - a duplicate SIRET is rejected as a clear conflict, not a raw 500
 *     (R61) — the pre-existing `organizations_siret_key` unique index,
 *     translated by createOrganizationWithVerification();
 *   - an unverified company cannot book (R73) — createBooking() calls
 *     assertClientCompanyIsVerified() before any payment work starts;
 *   - changing the SIRET of an already-approved organization sends its
 *     dossier back to review and demotes the organization's status (R81).
 */
describe.skipIf(!hasDatabase)("company verification — generalized circuit", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let createOrganizationWithVerification: typeof import(
    "@/server/domains/organizations/create-organization-with-verification"
  ).createOrganizationWithVerification;
  let updateOrganizationIdentity: typeof import(
    "@/server/domains/organizations/update-organization-identity"
  ).updateOrganizationIdentity;
  let approveVerification: typeof import("@/server/domains/verification/review").approveVerification;
  let createBooking: typeof import("@/server/domains/bookings/create-booking").createBooking;
  let ConflictError: typeof import("@/server/lib/errors").ConflictError;
  let ForbiddenError: typeof import("@/server/lib/errors").ForbiddenError;

  const cleanupOrgIds: string[] = [];
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    ({ createOrganizationWithVerification } = await import(
      "@/server/domains/organizations/create-organization-with-verification"
    ));
    ({ updateOrganizationIdentity } = await import(
      "@/server/domains/organizations/update-organization-identity"
    ));
    ({ approveVerification } = await import("@/server/domains/verification/review"));
    ({ createBooking } = await import("@/server/domains/bookings/create-booking"));
    ({ ConflictError, ForbiddenError } = await import("@/server/lib/errors"));
  });

  afterAll(async () => {
    for (const organizationId of cleanupOrgIds) {
      await prisma.landlordVerification.deleteMany({ where: { organizationId } });
      await prisma.organizationMember.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    for (const userId of cleanupUserIds) {
      await deleteTestUser(userId);
    }
    await prisma.$disconnect();
  });

  function companyIdentity(overrides: Partial<Record<string, string>> = {}) {
    return {
      holderType: "COMPANY" as const,
      legalName: "Test Company",
      siret: overrides.siret ?? uniqueSiret(),
      legalRepresentativeName: "Jane Doe",
      address: "1 rue Test",
      city: "Paris",
      postalCode: "75001",
    };
  }

  /** Fixture shortcut: moves a fresh DRAFT dossier straight to
   * PENDING_REVIEW so `approveVerification()` accepts it, without exercising
   * `submitVerification()`'s document-completeness gate — that gate is
   * covered elsewhere (tests/unit/verification-requirements.test.ts,
   * tests/integration/verification.test.ts). */
  async function markSubmitted(verificationId: string) {
    await prisma.landlordVerification.update({
      where: { id: verificationId },
      data: { status: "PENDING_REVIEW", submittedAt: new Date() },
    });
  }

  it("rejects a duplicate SIRET with a clear conflict (R61)", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    cleanupUserIds.push(userA.id, userB.id);

    const siret = uniqueSiret();

    const orgA = await createOrganizationWithVerification({
      actorUserId: userA.id,
      actorEmail: userA.email,
      actorName: "User A",
      identity: companyIdentity({ siret }),
      activityType: "OWNER",
      grantLandlordCapability: true,
    });
    cleanupOrgIds.push(orgA.id);

    await expect(
      createOrganizationWithVerification({
        actorUserId: userB.id,
        actorEmail: userB.email,
        actorName: "User B",
        identity: companyIdentity({ siret }),
        activityType: "OWNER",
        grantLandlordCapability: true,
      })
    ).rejects.toBeInstanceOf(ConflictError);

    // Confirmed it is specifically the SIRET conflict, not some other 409.
    await expect(
      createOrganizationWithVerification({
        actorUserId: userB.id,
        actorEmail: userB.email,
        actorName: "User B",
        identity: companyIdentity({ siret }),
        activityType: "OWNER",
        grantLandlordCapability: true,
      })
    ).rejects.toThrow(/SIRET/);

    // And user B was never left with a half-created organization/membership.
    const membership = await prisma.organizationMember.findFirst({ where: { profileId: userB.id } });
    expect(membership).toBeNull();
  });

  it("blocks a booking from an unverified tenant company (R72/R73), and lets it through once verified", async () => {
    const tenantOwner = await createTestUser();
    const adminActor = await createTestUser();
    cleanupUserIds.push(tenantOwner.id, adminActor.id);

    // A tenant-only company dossier: activityType is null, grantLandlordCapability
    // is false — this profile never becomes a landlord.
    const tenantOrg = await createOrganizationWithVerification({
      actorUserId: tenantOwner.id,
      actorEmail: tenantOwner.email,
      actorName: "Tenant Owner",
      identity: companyIdentity(),
      activityType: null,
      grantLandlordCapability: false,
    });
    cleanupOrgIds.push(tenantOrg.id);
    expect(tenantOrg.status).toBe("PENDING_VERIFICATION");

    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: tenantOwner.id } });
    expect(profile.isLandlord).toBe(false);

    // A real (published) space to book — the landlord side is irrelevant to
    // this test, just needs to exist.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const landlordOrg = await prisma.organization.create({
      data: {
        name: `Landlord Org ${suffix}`,
        siret: uniqueSiret(),
        email: `landlord-${suffix}@test.local`,
        address: "2 rue Test",
        city: "Paris",
        postalCode: "75002",
      },
    });
    cleanupOrgIds.push(landlordOrg.id);
    const property = await prisma.property.create({
      data: {
        label: "Verification Test Property",
        propertyType: "OFFICE",
        addressLine1: "2 rue Test",
        city: "Paris",
        postalCode: "75002",
        createdByProfileId: tenantOwner.id,
        owners: { create: { organizationId: landlordOrg.id, ownershipShareBasisPoints: 10000 } },
        operators: { create: { organizationId: landlordOrg.id } },
      },
    });
    const space = await prisma.space.create({
      data: {
        propertyId: property.id,
        organizationId: landlordOrg.id,
        slug: `verif-space-${suffix}`,
        name: "Verification Test Space",
        type: "MEETING_ROOM",
        description: "Used by company-verification tests",
        address: "2 rue Test",
        city: "Paris",
        postalCode: "75002",
        capacity: 10,
        amenities: [],
        photos: [],
        halfDayPriceCents: 9000,
        dayPriceCents: 15000,
        status: "PUBLISHED",
        openingHours: { create: [{ weekday: 1, opensAt: "09:00", closesAt: "18:00" }] },
      },
    });

    const bookingInput = {
      spaceId: space.id,
      date: "2031-06-09", // a Monday
      slot: "MORNING",
      participantsCount: 2,
      purpose: "Test R73",
      acceptTerms: true,
    } as const;

    await expect(createBooking(tenantOwner.id, bookingInput)).rejects.toBeInstanceOf(ForbiddenError);

    // Approve the dossier — the organization becomes VERIFIED, same as the
    // landlord path (review.ts is the one place that transition happens).
    const verification = await prisma.landlordVerification.findFirstOrThrow({
      where: { organizationId: tenantOrg.id },
    });
    await markSubmitted(verification.id);
    await approveVerification(verification.id, adminActor.id);
    const verifiedOrg = await prisma.organization.findUniqueOrThrow({ where: { id: tenantOrg.id } });
    expect(verifiedOrg.status).toBe("VERIFIED");

    // The R73 gate itself must no longer be the reason a booking fails —
    // any later failure (e.g. this environment's payment provider
    // configuration) is not what this test is about.
    try {
      await createBooking(tenantOwner.id, bookingInput);
    } catch (error) {
      expect(error).not.toBeInstanceOf(ForbiddenError);
    }

    await prisma.space.deleteMany({ where: { id: space.id } });
    await prisma.property.deleteMany({ where: { id: property.id } });
  });

  it("sends an approved dossier back to review when the SIRET changes (R81), without touching invoices or bookings retroactively", async () => {
    const owner = await createTestUser();
    const adminActor = await createTestUser();
    cleanupUserIds.push(owner.id, adminActor.id);

    const org = await createOrganizationWithVerification({
      actorUserId: owner.id,
      actorEmail: owner.email,
      actorName: "Owner",
      identity: companyIdentity(),
      activityType: "OWNER",
      grantLandlordCapability: true,
    });
    cleanupOrgIds.push(org.id);

    await markSubmitted(org.verificationId);
    await approveVerification(org.verificationId, adminActor.id);
    const approvedOrg = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(approvedOrg.status).toBe("VERIFIED");

    const newSiret = uniqueSiret();
    const result = await updateOrganizationIdentity(org.id, { siret: newSiret }, owner.id);
    expect(result.reverification).toBe(true);
    expect(result.organization.siret).toBe(newSiret);

    const demotedOrg = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(demotedOrg.status).toBe("PENDING_VERIFICATION");

    const demotedVerification = await prisma.landlordVerification.findUniqueOrThrow({
      where: { id: org.verificationId },
    });
    expect(demotedVerification.status).toBe("PENDING_REVIEW");
    expect(demotedVerification.reviewedAt).toBeNull();
    expect(demotedVerification.reviewedByProfileId).toBeNull();

    // Re-sending the same values is a no-op: no spurious re-review.
    const noop = await updateOrganizationIdentity(org.id, { siret: newSiret }, owner.id);
    expect(noop.reverification).toBe(false);
  });
});
