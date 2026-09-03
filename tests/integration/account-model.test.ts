import { beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";
import { createTestUser, deleteTestUser, uniqueSiret, uniqueSuffix } from "./helpers/test-fixtures";

/**
 * The Phase 2 account model, against a real database.
 *
 * Covers the four things that can only be verified here: what the signup
 * trigger actually writes, what the CHECK constraints actually refuse, that
 * "Devenir bailleur" is atomic, and that the mode switch cannot be talked
 * into granting access to someone else's organization.
 */
describe.skipIf(!hasDatabase)("account model (single account, two modes)", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let becomeLandlord: typeof import("@/server/domains/organizations/become-landlord").becomeLandlord;
  let switchMode: typeof import("@/server/domains/users/switch-mode").switchMode;
  let getAuthContextFor: (userId: string) => Promise<{
    isLandlord: boolean;
    activeMode: string;
    activeOrgId: string | null;
    activeOrgRole: string | null;
  }>;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    ({ becomeLandlord } = await import("@/server/domains/organizations/become-landlord"));
    ({ switchMode } = await import("@/server/domains/users/switch-mode"));

    const { resolveActiveContext } = await import("@/server/auth/active-context");
    // Resolves the context the way getAuthContext() does, without needing a
    // Supabase session: the profile row is the only input.
    getAuthContextFor = async (userId: string) => {
      const profile = await prisma.profile.findUniqueOrThrow({ where: { id: userId } });
      const active = await resolveActiveContext(profile);
      return {
        isLandlord: profile.isLandlord,
        activeMode: active.activeMode,
        activeOrgId: active.activeOrgId,
        activeOrgRole: active.activeOrgRole,
      };
    };
  });

  /** An actor shaped like the one a route handler would pass. */
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

  // -------------------------------------------------------------------------
  // Signup — what the trigger writes
  // -------------------------------------------------------------------------
  describe("signup", () => {
    it("creates a plain tenant: USER, no landlord capability, TENANT mode", async () => {
      const user = await createTestUser({ role: "CLIENT", name: "New Tenant" });
      const profile = await prisma.profile.findUniqueOrThrow({ where: { id: user.id } });

      expect(profile.platformRole).toBe("USER");
      expect(profile.isLandlord).toBe(false);
      expect(profile.activeMode).toBe("TENANT");
      expect(profile.activeOrganizationId).toBeNull();
      expect(
        await prisma.organizationMember.count({ where: { profileId: user.id } })
      ).toBe(0);

      await deleteTestUser(user.id);
    });

    it("gives a partner signup the capability, an organization and an OWNER membership", async () => {
      const user = await createTestUser({
        role: "PARTNER",
        name: "New Landlord",
        organization_name: `Signup Org ${uniqueSuffix()}`,
        organization_siret: uniqueSiret(),
        organization_address: "1 rue de Test",
        organization_city: "Paris",
        organization_postal_code: "75001",
      });

      const profile = await prisma.profile.findUniqueOrThrow({ where: { id: user.id } });
      expect(profile.platformRole).toBe("USER");
      expect(profile.isLandlord).toBe(true);
      // Every account starts as a tenant, capability or not.
      expect(profile.activeMode).toBe("TENANT");
      expect(profile.activeOrganizationId).not.toBeNull();

      const membership = await prisma.organizationMember.findFirstOrThrow({
        where: { profileId: user.id },
        include: { organization: true },
      });
      // Without this row the organization would exist and grant nothing.
      expect(membership.orgRole).toBe("OWNER");
      expect(membership.status).toBe("ACTIVE");
      expect(membership.organization.holderType).toBe("COMPANY");

      await deleteTestUser(user.id);
    });

    it("still refuses a self-assigned privileged role (S-01)", async () => {
      // raw_user_meta_data is client-controlled and reachable without this
      // app. platform_role is hard-coded to USER; there is no signup path to
      // ADMIN.
      const user = await createTestUser({ role: "ADMIN", name: "Attacker" });
      const profile = await prisma.profile.findUniqueOrThrow({ where: { id: user.id } });

      expect(profile.role).toBe("CLIENT");
      expect(profile.platformRole).toBe("USER");
      expect(profile.isLandlord).toBe(false);

      await deleteTestUser(user.id);
    });

    it("ignores injected account-model fields in the signup metadata", async () => {
      const user = await createTestUser({
        role: "CLIENT",
        name: "Injector",
        platform_role: "ADMIN",
        is_landlord: "true",
        active_mode: "LANDLORD",
      });
      const profile = await prisma.profile.findUniqueOrThrow({ where: { id: user.id } });

      expect(profile.platformRole).toBe("USER");
      expect(profile.isLandlord).toBe(false);
      expect(profile.activeMode).toBe("TENANT");

      await deleteTestUser(user.id);
    });
  });

  // -------------------------------------------------------------------------
  // Constraints — what the database refuses
  // -------------------------------------------------------------------------
  describe("database constraints", () => {
    it("refuses LANDLORD mode on an account without the capability", async () => {
      // Enforced in the database, so even a direct SQL write cannot produce
      // the invalid combination.
      const user = await createTestUser();
      await expect(
        prisma.profile.update({
          where: { id: user.id },
          data: { activeMode: "LANDLORD" },
        })
      ).rejects.toThrow(/profiles_landlord_mode_requires_capability_check/);
      await deleteTestUser(user.id);
    });

    it("refuses a duplicate membership", async () => {
      const user = await createTestUser();
      const org = await prisma.organization.create({
        data: {
          name: `Dup Org ${uniqueSuffix()}`,
          holderType: "COMPANY",
          siret: uniqueSiret(),
          email: "dup@test.local",
          address: "1 rue de Test",
          city: "Paris",
          postalCode: "75001",
        },
      });
      await prisma.organizationMember.create({
        data: { organizationId: org.id, profileId: user.id, orgRole: "OWNER" },
      });

      await expect(
        prisma.organizationMember.create({
          data: { organizationId: org.id, profileId: user.id, orgRole: "VIEWER" },
        })
      ).rejects.toThrow();

      await deleteTestUser(user.id);
    });

    it("refuses a membership of a phantom organization", async () => {
      const user = await createTestUser();
      await expect(
        prisma.organizationMember.create({
          data: {
            organizationId: "00000000-0000-0000-0000-000000000000",
            profileId: user.id,
            orgRole: "OWNER",
          },
        })
      ).rejects.toThrow();
      await deleteTestUser(user.id);
    });

    it("refuses an individual holder carrying a SIRET", async () => {
      await expect(
        prisma.organization.create({
          data: {
            name: "Bad Individual",
            holderType: "INDIVIDUAL",
            siret: uniqueSiret(),
            email: "x@test.local",
            address: "1 rue de Test",
            city: "Paris",
            postalCode: "75001",
          },
        })
      ).rejects.toThrow(/organizations_holder_type_siret_check/);
    });

    it("refuses a company holder with no SIRET", async () => {
      await expect(
        prisma.organization.create({
          data: {
            name: "Bad Company",
            holderType: "COMPANY",
            email: "x@test.local",
            address: "1 rue de Test",
            city: "Paris",
            postalCode: "75001",
          },
        })
      ).rejects.toThrow(/organizations_holder_type_siret_check/);
    });

    it("allows several individual holders — NULL SIRETs do not collide", async () => {
      const suffix = uniqueSuffix();
      const [a, b] = await Promise.all([
        prisma.organization.create({
          data: {
            name: `Indiv A ${suffix}`,
            holderType: "INDIVIDUAL",
            email: `a-${suffix}@test.local`,
            address: "1 rue A",
            city: "Paris",
            postalCode: "75001",
          },
        }),
        prisma.organization.create({
          data: {
            name: `Indiv B ${suffix}`,
            holderType: "INDIVIDUAL",
            email: `b-${suffix}@test.local`,
            address: "1 rue B",
            city: "Lyon",
            postalCode: "69001",
          },
        }),
      ]);
      expect(a.siret).toBeNull();
      expect(b.siret).toBeNull();
    });

    it("keeps RLS enabled on organization_members", async () => {
      const [row] = await prisma.$queryRaw<Array<{ rls: boolean }>>`
        SELECT relrowsecurity AS rls FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'organization_members'
      `;
      expect(row?.rls).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // "Devenir bailleur"
  // -------------------------------------------------------------------------
  describe("becomeLandlord", () => {
    it("opens an individual activity: organization, OWNER membership, capability", async () => {
      const user = await createTestUser({ role: "CLIENT", name: "Jean Dupont" });
      const actor = await actorFor(user.id);

      const organization = await becomeLandlord({
        actor,
        input: {
          holderType: "INDIVIDUAL",
          activityType: "OWNER",
          address: "12 rue de Rivoli",
          city: "Paris",
          postalCode: "75004",
        },
      });

      expect(organization.holderType).toBe("INDIVIDUAL");
      // PENDING_VERIFICATION, so publication stays gated until Phase 3.
      expect(organization.status).toBe("PENDING_VERIFICATION");
      // Falls back to the profile name rather than inventing one.
      expect(organization.name).toBe("Jean Dupont");

      const membership = await prisma.organizationMember.findFirstOrThrow({
        where: { profileId: user.id },
      });
      expect(membership.orgRole).toBe("OWNER");
      expect(membership.status).toBe("ACTIVE");

      const profile = await prisma.profile.findUniqueOrThrow({ where: { id: user.id } });
      expect(profile.isLandlord).toBe(true);
      expect(profile.activeOrganizationId).toBe(organization.id);
      // The capability is unlocked; using it is a separate act.
      expect(profile.activeMode).toBe("TENANT");

      await deleteTestUser(user.id);
    });

    it("opens a company activity and derives the SIREN from the SIRET", async () => {
      const user = await createTestUser();
      const siret = uniqueSiret();

      const organization = await becomeLandlord({
        actor: await actorFor(user.id),
        input: {
          holderType: "COMPANY",
          activityType: "OWNER",
          legalName: "Atelier Partners",
          siret,
          legalRepresentativeName: "Julie Martin",
          isRealEstateProfessional: false,
          address: "12 rue de Rivoli",
          city: "Paris",
          postalCode: "75004",
        },
      });

      const stored = await prisma.organization.findUniqueOrThrow({
        where: { id: organization.id },
      });
      expect(stored.siret).toBe(siret);
      expect(stored.siren).toBe(siret.slice(0, 9));
      expect(stored.legalName).toBe("Atelier Partners");
      expect(stored.legalRepresentativeName).toBe("Julie Martin");

      await deleteTestUser(user.id);
    });

    it("refuses a SIREN that contradicts the SIRET", async () => {
      const user = await createTestUser();
      await expect(
        becomeLandlord({
          actor: await actorFor(user.id),
          input: {
            holderType: "COMPANY",
            activityType: "OWNER",
            legalName: "Mismatch SARL",
            siret: uniqueSiret(),
            siren: "999999999",
            legalRepresentativeName: "Someone",
            isRealEstateProfessional: false,
            address: "1 rue de Test",
            city: "Paris",
            postalCode: "75001",
          },
        })
      ).rejects.toMatchObject({ status: 400 });
      await deleteTestUser(user.id);
    });

    it("refuses a second activity on the same account", async () => {
      const user = await createTestUser();
      await becomeLandlord({
        actor: await actorFor(user.id),
        input: {
          holderType: "INDIVIDUAL",
          activityType: "OWNER",
          address: "1 rue de Test",
          city: "Paris",
          postalCode: "75001",
        },
      });

      await expect(
        becomeLandlord({
          actor: await actorFor(user.id),
          input: {
            holderType: "INDIVIDUAL",
            activityType: "OWNER",
            address: "2 rue de Test",
            city: "Lyon",
            postalCode: "69001",
          },
        })
      ).rejects.toMatchObject({ status: 409 });

      expect(
        await prisma.organizationMember.count({ where: { profileId: user.id } })
      ).toBe(1);

      await deleteTestUser(user.id);
    });

    it("leaves nothing behind when it fails", async () => {
      // Atomicity is the whole point: an organization with no membership
      // would look correct and grant nothing.
      //
      // Scoped to this attempt's own SIRET rather than a global
      // organization count: this suite runs alongside other integration
      // files against the same database, all creating organizations
      // concurrently, so a table-wide count is inherently racy. A SIRET
      // unique to this one attempt is not.
      const user = await createTestUser();
      const doomedSiret = uniqueSiret();

      await expect(
        becomeLandlord({
          actor: await actorFor(user.id),
          input: {
            holderType: "COMPANY",
            activityType: "OWNER",
            legalName: "Doomed SARL",
            siret: doomedSiret,
            siren: "111111111", // contradicts the SIRET
            legalRepresentativeName: "Someone",
            isRealEstateProfessional: false,
            address: "1 rue de Test",
            city: "Paris",
            postalCode: "75001",
          },
        })
      ).rejects.toThrow();

      expect(await prisma.organization.findFirst({ where: { siret: doomedSiret } })).toBeNull();
      expect(
        await prisma.organizationMember.count({ where: { profileId: user.id } })
      ).toBe(0);
      const profile = await prisma.profile.findUniqueOrThrow({ where: { id: user.id } });
      expect(profile.isLandlord).toBe(false);

      await deleteTestUser(user.id);
    });
  });

  // -------------------------------------------------------------------------
  // Mode switching — the acceptance scenario, end to end
  // -------------------------------------------------------------------------
  describe("mode switching", () => {
    it("refuses LANDLORD for an account that has not opened an activity", async () => {
      const user = await createTestUser();
      await expect(
        switchMode({ actor: await actorFor(user.id), input: { mode: "LANDLORD" } })
      ).rejects.toMatchObject({ status: 403 });

      const profile = await prisma.profile.findUniqueOrThrow({ where: { id: user.id } });
      expect(profile.activeMode).toBe("TENANT");

      await deleteTestUser(user.id);
    });

    it("runs the full journey: tenant -> become landlord -> switch -> switch back", async () => {
      const user = await createTestUser({ role: "CLIENT", name: "Sam Client" });

      // 1. starts as a tenant with no landlord context
      let ctx = await getAuthContextFor(user.id);
      expect(ctx).toMatchObject({ isLandlord: false, activeMode: "TENANT", activeOrgId: null });

      // 2. opens the activity
      const organization = await becomeLandlord({
        actor: await actorFor(user.id),
        input: {
          holderType: "INDIVIDUAL",
          activityType: "OWNER",
          address: "12 rue de Rivoli",
          city: "Paris",
          postalCode: "75004",
        },
      });

      // 3. capability unlocked, still in tenant mode
      ctx = await getAuthContextFor(user.id);
      expect(ctx).toMatchObject({ isLandlord: true, activeMode: "TENANT" });

      // 4. switches to landlord
      await switchMode({ actor: await actorFor(user.id), input: { mode: "LANDLORD" } });
      ctx = await getAuthContextFor(user.id);
      expect(ctx).toMatchObject({
        activeMode: "LANDLORD",
        activeOrgId: organization.id,
        activeOrgRole: "OWNER",
      });

      // 5. and back — same account throughout
      await switchMode({ actor: await actorFor(user.id), input: { mode: "TENANT" } });
      ctx = await getAuthContextFor(user.id);
      expect(ctx).toMatchObject({ activeMode: "TENANT", isLandlord: true });

      await deleteTestUser(user.id);
    });

    it("refuses an organization the caller is not a member of", async () => {
      const [mine, theirs] = await Promise.all([createTestUser(), createTestUser()]);

      const theirOrg = await becomeLandlord({
        actor: await actorFor(theirs.id),
        input: {
          holderType: "INDIVIDUAL",
          activityType: "OWNER",
          address: "1 rue Leur",
          city: "Lyon",
          postalCode: "69001",
        },
      });
      await becomeLandlord({
        actor: await actorFor(mine.id),
        input: {
          holderType: "INDIVIDUAL",
          activityType: "OWNER",
          address: "1 rue Mienne",
          city: "Paris",
          postalCode: "75001",
        },
      });

      // The central isolation test: a landlord naming someone else's
      // organization gets refused, not that organization.
      await expect(
        switchMode({
          actor: await actorFor(mine.id),
          input: { mode: "LANDLORD", organizationId: theirOrg.id },
        })
      ).rejects.toMatchObject({ status: 403 });

      const profile = await prisma.profile.findUniqueOrThrow({ where: { id: mine.id } });
      expect(profile.activeOrganizationId).not.toBe(theirOrg.id);

      await deleteTestUser(mine.id);
      await deleteTestUser(theirs.id);
    });

    it("drops the landlord context when the membership is revoked, without a new sign-in", async () => {
      const user = await createTestUser();
      const organization = await becomeLandlord({
        actor: await actorFor(user.id),
        input: {
          holderType: "INDIVIDUAL",
          activityType: "OWNER",
          address: "1 rue de Test",
          city: "Paris",
          postalCode: "75001",
        },
      });
      await switchMode({ actor: await actorFor(user.id), input: { mode: "LANDLORD" } });

      // Off-boarded. The stored columns still say LANDLORD / this org.
      await prisma.organizationMember.update({
        where: { organizationId_profileId: { organizationId: organization.id, profileId: user.id } },
        data: { status: "REVOKED" },
      });

      const ctx = await getAuthContextFor(user.id);
      expect(ctx.activeOrgId).toBeNull();
      expect(ctx.activeOrgRole).toBeNull();
      expect(ctx.activeMode).toBe("TENANT");

      await deleteTestUser(user.id);
    });

    it("does not promote a VIEWER by any request", async () => {
      // A member downgraded to VIEWER keeps only the read capability, and no
      // switch or payload changes that.
      const user = await createTestUser();
      const organization = await becomeLandlord({
        actor: await actorFor(user.id),
        input: {
          holderType: "INDIVIDUAL",
          activityType: "OWNER",
          address: "1 rue de Test",
          city: "Paris",
          postalCode: "75001",
        },
      });
      await prisma.organizationMember.update({
        where: { organizationId_profileId: { organizationId: organization.id, profileId: user.id } },
        data: { orgRole: "VIEWER" },
      });

      await switchMode({
        actor: await actorFor(user.id),
        input: { mode: "LANDLORD", organizationId: organization.id },
      });

      const actor = await actorFor(user.id);
      expect(actor.activeOrgRole).toBe("VIEWER");
      expect(actor.capabilities.has("landlord:view_dashboard")).toBe(true);
      expect(actor.capabilities.has("landlord:manage_spaces")).toBe(false);
      expect(actor.capabilities.has("landlord:manage_members")).toBe(false);

      await deleteTestUser(user.id);
    });
  });

  // -------------------------------------------------------------------------
  // Membership invariant the database cannot hold
  // -------------------------------------------------------------------------
  describe("organization always keeps an owner", () => {
    it("refuses a change that would leave no ACTIVE owner", async () => {
      const { assertOrganizationKeepsAnOwner } = await import(
        "@/server/domains/organizations/membership"
      );
      const user = await createTestUser();
      const organization = await becomeLandlord({
        actor: await actorFor(user.id),
        input: {
          holderType: "INDIVIDUAL",
          activityType: "OWNER",
          address: "1 rue de Test",
          city: "Paris",
          postalCode: "75001",
        },
      });

      await expect(
        prisma.$transaction((tx) =>
          assertOrganizationKeepsAnOwner(tx, organization.id, user.id)
        )
      ).rejects.toMatchObject({ status: 409 });

      await deleteTestUser(user.id);
    });

    it("allows it when another ACTIVE owner remains", async () => {
      const { assertOrganizationKeepsAnOwner } = await import(
        "@/server/domains/organizations/membership"
      );
      const [first, second] = await Promise.all([createTestUser(), createTestUser()]);
      const organization = await becomeLandlord({
        actor: await actorFor(first.id),
        input: {
          holderType: "INDIVIDUAL",
          activityType: "OWNER",
          address: "1 rue de Test",
          city: "Paris",
          postalCode: "75001",
        },
      });
      // Two owners is the normal case for an agency, which is why this is not
      // a unique index.
      await prisma.organizationMember.create({
        data: { organizationId: organization.id, profileId: second.id, orgRole: "OWNER" },
      });

      await expect(
        prisma.$transaction((tx) =>
          assertOrganizationKeepsAnOwner(tx, organization.id, first.id)
        )
      ).resolves.toBeUndefined();

      await deleteTestUser(first.id);
      await deleteTestUser(second.id);
    });
  });
});
