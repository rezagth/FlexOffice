import { beforeAll, describe, expect, it, vi } from "vitest";
import { hasDatabase } from "./helpers/should-run";
import { createTestUser, deleteTestUser, uniqueSiret } from "./helpers/test-fixtures";

/**
 * `requireVerificationOwnerAccess()` calls `requireAuth()`, which resolves
 * the session through Supabase. This suite is gated on `hasDatabase` (a real
 * Prisma connection) rather than `hasSupabase` (a real project) — everything
 * except the "is there a valid cookie" question is exercised for real
 * (membership lookup, capability resolution, all against Postgres); only the
 * session layer is faked, the same way tests/unit/rbac.test.ts fakes it.
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

/**
 * The onboarding dossier, end to end against a real database.
 *
 * Covers what tests/integration/account-model.test.ts does not: the review
 * workflow (take charge, approve, reject, resubmit), the completeness gate
 * on submission, and the authorization boundary a self-service caller runs
 * into — a plain member, a foreign account, and an admin reviewing their own
 * dossier.
 */
describe.skipIf(!hasDatabase)("landlord verification (onboarding dossier)", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let becomeLandlord: typeof import("@/server/domains/organizations/become-landlord").becomeLandlord;
  let submitVerification: typeof import("@/server/domains/verification/submit").submitVerification;
  let takeChargeOfVerification: typeof import("@/server/domains/verification/review").takeChargeOfVerification;
  let approveVerification: typeof import("@/server/domains/verification/review").approveVerification;
  let rejectVerification: typeof import("@/server/domains/verification/review").rejectVerification;
  let requireVerificationOwnerAccess: typeof import("@/server/domains/verification/access").requireVerificationOwnerAccess;
  let getOwnVerification: typeof import("@/server/domains/verification/get").getOwnVerification;

  beforeAll(async () => {
    // Placeholders only — the session layer is fully mocked above, so these
    // just need to make getAuthRuntimeMode() report READY.
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
    delete process.env.OFFICEFLEX_DEMO_MODE;

    ({ prisma } = await import("@/server/db/prisma"));
    ({ becomeLandlord } = await import("@/server/domains/organizations/become-landlord"));
    ({ submitVerification } = await import("@/server/domains/verification/submit"));
    ({ takeChargeOfVerification, approveVerification, rejectVerification } = await import(
      "@/server/domains/verification/review"
    ));
    ({ requireVerificationOwnerAccess } = await import("@/server/domains/verification/access"));
    ({ getOwnVerification } = await import("@/server/domains/verification/get"));
  });

  /** An actor shaped like the one a route handler would pass — mirrors
   * account-model.test.ts's helper of the same shape. */
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

  /** Opens a landlord activity and returns its dossier, ready for document
   * fixtures to be inserted directly (bypassing real file upload, which
   * needs a real Supabase Storage project — see verification-storage.test.ts
   * for the parts of that path unit tests can cover). */
  async function openActivity(
    userId: string,
    overrides: { holderType?: "INDIVIDUAL" | "COMPANY"; activityType?: "OWNER" | "OPERATOR" } = {}
  ) {
    const holderType = overrides.holderType ?? "INDIVIDUAL";
    const activityType = overrides.activityType ?? "OWNER";

    const input =
      holderType === "INDIVIDUAL"
        ? ({
            holderType: "INDIVIDUAL",
            activityType,
            address: "1 rue de Test",
            city: "Paris",
            postalCode: "75001",
          } as const)
        : ({
            holderType: "COMPANY",
            activityType,
            legalName: "Test SARL",
            siret: uniqueSiret(),
            legalRepresentativeName: "Test Rep",
            address: "1 rue de Test",
            city: "Paris",
            postalCode: "75001",
          } as const);

    const organization = await becomeLandlord({ actor: await actorFor(userId), input });
    const verification = await prisma.landlordVerification.findFirstOrThrow({
      where: { organizationId: organization.id },
    });
    return { organization, verification };
  }

  /** Inserts document rows directly, standing in for a real upload — proven
   * separately by verification-storage.test.ts (the sniffing/sanitizing/path
   * logic) and gated behind hasSupabase where real Storage is required. */
  async function fixtureDocuments(
    verificationId: string,
    uploadedByProfileId: string,
    types: readonly string[]
  ) {
    for (const type of types) {
      await prisma.verificationDocument.create({
        data: {
          verificationId,
          type: type as never,
          storagePath: `test/${verificationId}/${crypto.randomUUID()}.pdf`,
          originalFilename: "fixture.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          uploadedByProfileId,
        },
      });
    }
  }

  // ---------------------------------------------------------------------
  // Submission — the completeness gate
  // ---------------------------------------------------------------------
  describe("submitVerification", () => {
    it("refuses submission with missing required documents", async () => {
      const user = await createTestUser();
      const { organization, verification } = await openActivity(user.id, {
        holderType: "INDIVIDUAL",
        activityType: "OWNER",
      });
      await fixtureDocuments(verification.id, user.id, ["IDENTITY_DOCUMENT"]); // missing OWNERSHIP_PROOF

      await expect(
        submitVerification({
          verification,
          organizationId: organization.id,
          holderType: "INDIVIDUAL",
          actorProfileId: user.id,
        })
      ).rejects.toMatchObject({ status: 400 });

      const reloaded = await prisma.landlordVerification.findUniqueOrThrow({
        where: { id: verification.id },
      });
      expect(reloaded.status).toBe("DRAFT");

      await deleteTestUser(user.id);
    });

    it("accepts submission once every required type is present", async () => {
      const user = await createTestUser();
      const { organization, verification } = await openActivity(user.id, {
        holderType: "INDIVIDUAL",
        activityType: "OWNER",
      });
      await fixtureDocuments(verification.id, user.id, ["IDENTITY_DOCUMENT", "OWNERSHIP_PROOF"]);

      const updated = await submitVerification({
        verification,
        organizationId: organization.id,
        holderType: "INDIVIDUAL",
        actorProfileId: user.id,
      });
      expect(updated.status).toBe("PENDING_REVIEW");
      expect(updated.submittedAt).not.toBeNull();

      await deleteTestUser(user.id);
    });

    it("requires all four documents for a company operator", async () => {
      const user = await createTestUser();
      const { organization, verification } = await openActivity(user.id, {
        holderType: "COMPANY",
        activityType: "OPERATOR",
      });
      await fixtureDocuments(verification.id, user.id, [
        "K_BIS",
        "VAT_PROOF",
        "LEGAL_REPRESENTATIVE_ID",
      ]); // missing SUBLEASE_AUTHORIZATION

      await expect(
        submitVerification({
          verification,
          organizationId: organization.id,
          holderType: "COMPANY",
          actorProfileId: user.id,
        })
      ).rejects.toMatchObject({ status: 400 });

      await fixtureDocuments(verification.id, user.id, ["SUBLEASE_AUTHORIZATION"]);
      const updated = await submitVerification({
        verification,
        organizationId: organization.id,
        holderType: "COMPANY",
        actorProfileId: user.id,
      });
      expect(updated.status).toBe("PENDING_REVIEW");

      await deleteTestUser(user.id);
    });

    it("refuses to submit a dossier already under review", async () => {
      const user = await createTestUser();
      const { organization, verification } = await openActivity(user.id);
      await fixtureDocuments(verification.id, user.id, ["IDENTITY_DOCUMENT", "OWNERSHIP_PROOF"]);
      await submitVerification({
        verification,
        organizationId: organization.id,
        holderType: "INDIVIDUAL",
        actorProfileId: user.id,
      });

      const pending = await prisma.landlordVerification.findUniqueOrThrow({
        where: { id: verification.id },
      });
      await expect(
        submitVerification({
          verification: pending,
          organizationId: organization.id,
          holderType: "INDIVIDUAL",
          actorProfileId: user.id,
        })
      ).rejects.toMatchObject({ status: 409 });

      await deleteTestUser(user.id);
    });
  });

  // ---------------------------------------------------------------------
  // Admin review — take charge, approve, reject
  // ---------------------------------------------------------------------
  describe("admin review", () => {
    async function submittedDossier() {
      const user = await createTestUser();
      const { organization, verification } = await openActivity(user.id);
      await fixtureDocuments(verification.id, user.id, ["IDENTITY_DOCUMENT", "OWNERSHIP_PROOF"]);
      await submitVerification({
        verification,
        organizationId: organization.id,
        holderType: "INDIVIDUAL",
        actorProfileId: user.id,
      });
      const admin = await createTestUser({ role: "CLIENT", name: "Admin Reviewer" });
      await prisma.profile.update({ where: { id: admin.id }, data: { platformRole: "ADMIN" } });
      return { user, organization, verificationId: verification.id, admin };
    }

    it("moves PENDING_REVIEW to IN_REVIEW on take-charge", async () => {
      const { user, verificationId, admin } = await submittedDossier();
      await takeChargeOfVerification(verificationId, admin.id);

      const updated = await prisma.landlordVerification.findUniqueOrThrow({
        where: { id: verificationId },
      });
      expect(updated.status).toBe("IN_REVIEW");
      expect(updated.reviewStartedAt).not.toBeNull();

      await deleteTestUser(user.id);
      await deleteTestUser(admin.id);
    });

    it("refuses to take charge of a dossier that is not pending", async () => {
      const { user, verificationId, admin } = await submittedDossier();
      await takeChargeOfVerification(verificationId, admin.id);

      await expect(takeChargeOfVerification(verificationId, admin.id)).rejects.toMatchObject({
        status: 409,
      });

      await deleteTestUser(user.id);
      await deleteTestUser(admin.id);
    });

    it("approves a dossier and sets the organization VERIFIED", async () => {
      const { user, organization, verificationId, admin } = await submittedDossier();

      await approveVerification(verificationId, admin.id);

      const [verification, org] = await Promise.all([
        prisma.landlordVerification.findUniqueOrThrow({ where: { id: verificationId } }),
        prisma.organization.findUniqueOrThrow({ where: { id: organization.id } }),
      ]);
      expect(verification.status).toBe("APPROVED");
      expect(verification.reviewedAt).not.toBeNull();
      expect(verification.reviewedByProfileId).toBe(admin.id);
      // The one place Organization.status becomes VERIFIED.
      expect(org.status).toBe("VERIFIED");

      await deleteTestUser(user.id);
      await deleteTestUser(admin.id);
    });

    it("rejects a dossier with a reason, and does not touch organization status", async () => {
      const { user, organization, verificationId, admin } = await submittedDossier();

      await rejectVerification(verificationId, admin.id, "Le Kbis fourni est illisible.");

      const [verification, org] = await Promise.all([
        prisma.landlordVerification.findUniqueOrThrow({ where: { id: verificationId } }),
        prisma.organization.findUniqueOrThrow({ where: { id: organization.id } }),
      ]);
      expect(verification.status).toBe("REJECTED");
      expect(verification.rejectionReason).toBe("Le Kbis fourni est illisible.");
      // Cas 5: a rejected dossier must never be considered verified.
      expect(org.status).not.toBe("VERIFIED");
      expect(org.status).toBe("PENDING_VERIFICATION");

      await deleteTestUser(user.id);
      await deleteTestUser(admin.id);
    });

    it("refuses an admin approving their own dossier (Cas 4)", async () => {
      const admin = await createTestUser({ role: "CLIENT", name: "Self Reviewer" });
      await prisma.profile.update({ where: { id: admin.id }, data: { platformRole: "ADMIN" } });
      const { verification } = await openActivity(admin.id);
      await fixtureDocuments(verification.id, admin.id, ["IDENTITY_DOCUMENT", "OWNERSHIP_PROOF"]);
      await submitVerification({
        verification,
        organizationId: verification.organizationId,
        holderType: "INDIVIDUAL",
        actorProfileId: admin.id,
      });

      await expect(approveVerification(verification.id, admin.id)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        rejectVerification(verification.id, admin.id, "no")
      ).rejects.toMatchObject({ status: 403 });

      const untouched = await prisma.landlordVerification.findUniqueOrThrow({
        where: { id: verification.id },
      });
      expect(untouched.status).toBe("PENDING_REVIEW");

      await deleteTestUser(admin.id);
    });

    it("scenario 4: rejected -> corrected -> resubmitted -> reviewable again", async () => {
      const { user, verificationId, admin } = await submittedDossier();

      await rejectVerification(verificationId, admin.id, "Document flou, merci de le refaire.");
      let verification = await prisma.landlordVerification.findUniqueOrThrow({
        where: { id: verificationId },
      });
      expect(verification.status).toBe("REJECTED");

      // Correction: add a fresh document (simulates re-upload) and resubmit.
      await fixtureDocuments(verificationId, user.id, ["IDENTITY_DOCUMENT"]);
      verification = await submitVerification({
        verification,
        organizationId: verification.organizationId,
        holderType: "INDIVIDUAL",
        actorProfileId: user.id,
      });
      expect(verification.status).toBe("PENDING_REVIEW");
      // The stale reason from the previous cycle must not linger next to a
      // status that no longer means "rejected".
      expect(verification.rejectionReason).toBeNull();

      await takeChargeOfVerification(verificationId, admin.id);
      const inReview = await prisma.landlordVerification.findUniqueOrThrow({
        where: { id: verificationId },
      });
      expect(inReview.status).toBe("IN_REVIEW");

      await deleteTestUser(user.id);
      await deleteTestUser(admin.id);
    });
  });

  // ---------------------------------------------------------------------
  // Self-service authorization
  // ---------------------------------------------------------------------
  describe("requireVerificationOwnerAccess", () => {
    it("allows the OWNER who requested the dossier", async () => {
      const user = await createTestUser();
      const { verification } = await openActivity(user.id);

      const { ctx } = await requireOrganizationAccessAs(user.id, verification.id);
      expect(ctx.userId).toBe(user.id);

      await deleteTestUser(user.id);
    });

    it("refuses a caller who is not a member of the organization at all (Cas 1/2)", async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      const { verification } = await openActivity(owner.id);

      await expect(requireOrganizationAccessAs(stranger.id, verification.id)).rejects.toMatchObject(
        { status: 403 }
      );

      await deleteTestUser(owner.id);
      await deleteTestUser(stranger.id);
    });

    it("refuses a VIEWER member — reading the dashboard is not managing the dossier", async () => {
      const owner = await createTestUser();
      const viewer = await createTestUser();
      const { organization, verification } = await openActivity(owner.id);
      await prisma.organizationMember.create({
        data: { organizationId: organization.id, profileId: viewer.id, orgRole: "VIEWER" },
      });

      await expect(requireOrganizationAccessAs(viewer.id, verification.id)).rejects.toMatchObject(
        { status: 403 }
      );

      await deleteTestUser(owner.id);
      await deleteTestUser(viewer.id);
    });

    it("allows an org ADMIN member, not only the OWNER", async () => {
      const owner = await createTestUser();
      const orgAdmin = await createTestUser();
      const { organization, verification } = await openActivity(owner.id);
      await prisma.organizationMember.create({
        data: { organizationId: organization.id, profileId: orgAdmin.id, orgRole: "ADMIN" },
      });

      const { ctx } = await requireOrganizationAccessAs(orgAdmin.id, verification.id);
      expect(ctx.userId).toBe(orgAdmin.id);

      await deleteTestUser(owner.id);
      await deleteTestUser(orgAdmin.id);
    });

    it("answers 404 for an unknown dossier id", async () => {
      const user = await createTestUser();
      await expect(
        requireOrganizationAccessAs(user.id, "00000000-0000-0000-0000-000000000000")
      ).rejects.toMatchObject({ status: 404 });
      await deleteTestUser(user.id);
    });

    it("does NOT give a platform administrator a bypass on the self-service path", async () => {
      // Deliberate: reviewing and managing an applicant's own evidence are
      // different jobs. An admin with no membership of the organization
      // must be refused here, even though requireAdmin() would let them
      // through the separate /api/admin/verifications/* routes.
      const owner = await createTestUser();
      const admin = await createTestUser({ role: "CLIENT", name: "Uninvolved Admin" });
      await prisma.profile.update({ where: { id: admin.id }, data: { platformRole: "ADMIN" } });
      const { verification } = await openActivity(owner.id);

      await expect(requireOrganizationAccessAs(admin.id, verification.id)).rejects.toMatchObject(
        { status: 403 }
      );

      await deleteTestUser(owner.id);
      await deleteTestUser(admin.id);
    });

    /** Drives requireVerificationOwnerAccess() as `userId` by pointing the
     * mocked Supabase session at that profile's own auth.users row — the
     * real getAuthContext() then resolves platformRole/isLandlord/capabilities
     * from Postgres exactly as it would for a genuine request. */
    async function requireOrganizationAccessAs(userId: string, verificationId: string) {
      currentSessionUserId = userId;
      try {
        return await requireVerificationOwnerAccess(verificationId);
      } finally {
        currentSessionUserId = null;
      }
    }
  });

  // ---------------------------------------------------------------------
  // Reading one's own dossier
  // ---------------------------------------------------------------------
  describe("getOwnVerification", () => {
    it("returns null for an account with no landlord organization", async () => {
      const user = await createTestUser();
      expect(await getOwnVerification(user.id)).toBeNull();
      await deleteTestUser(user.id);
    });

    it("returns the dossier with its documents for a landlord", async () => {
      const user = await createTestUser();
      const { verification } = await openActivity(user.id);
      await fixtureDocuments(verification.id, user.id, ["IDENTITY_DOCUMENT"]);

      const own = await getOwnVerification(user.id);
      expect(own?.id).toBe(verification.id);
      expect(own?.documents).toHaveLength(1);
      // Never a storage path in a response shaped for a client.
      expect(own?.documents[0]).not.toHaveProperty("storagePath");

      await deleteTestUser(user.id);
    });
  });
});
