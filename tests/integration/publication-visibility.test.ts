import { beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";
import { createTestOrganization, createTestSpace } from "./helpers/test-fixtures";

/**
 * A suspended organization must publish nothing.
 *
 * `Organization.status` existed with three values, was displayed in the admin
 * back office, and was read by no business rule at all: `listPublishedSpaces()`
 * filtered on `Space.status = PUBLISHED` and nothing else. Suspending an
 * organization left its listings live and bookable — on a marketplace whose
 * stated core is trust between companies, a suspension that suspends nothing
 * is the worst kind of control, because it looks like one.
 */
describe.skipIf(!hasDatabase)("publication and organization status", () => {
  let listPublishedSpaces: typeof import("@/server/domains/spaces/list-spaces").listPublishedSpaces;
  let getPublishedSpaceBySlug: typeof import("@/server/domains/spaces/list-spaces").getPublishedSpaceBySlug;
  let assertOrganizationCanPublish: typeof import("@/server/domains/organizations/publication-guard").assertOrganizationCanPublish;

  let verifiedSlug: string;
  let pendingSlug: string;
  let suspendedSlug: string;
  let verifiedOrgId: string;
  let pendingOrgId: string;
  let suspendedOrgId: string;
  let city: string;

  beforeAll(async () => {
    const { prisma } = await import("@/server/db/prisma");
    ({ listPublishedSpaces, getPublishedSpaceBySlug } = await import(
      "@/server/domains/spaces/list-spaces"
    ));
    ({ assertOrganizationCanPublish } = await import(
      "@/server/domains/organizations/publication-guard"
    ));

    city = `TestCity${Date.now()}`;

    const verified = await createTestOrganization({ name: "Verified Org", city });
    const pending = await createTestOrganization({ name: "Pending Org", city });
    const suspended = await createTestOrganization({ name: "Suspended Org", city });

    verifiedOrgId = verified.id;
    pendingOrgId = pending.id;
    suspendedOrgId = suspended.id;

    await prisma.organization.update({
      where: { id: verified.id },
      data: { status: "VERIFIED" },
    });
    await prisma.organization.update({
      where: { id: suspended.id },
      data: { status: "SUSPENDED" },
    });
    // `pending` keeps the PENDING_VERIFICATION default.

    verifiedSlug = (await createTestSpace(verified.id, { status: "PUBLISHED", city })).slug;
    pendingSlug = (await createTestSpace(pending.id, { status: "PUBLISHED", city })).slug;
    suspendedSlug = (await createTestSpace(suspended.id, { status: "PUBLISHED", city })).slug;

    // All three spaces are PUBLISHED, so the only thing that can separate
    // them in the assertions below is the organization's status.
  });


  describe("public search", () => {
    it("hides a suspended organization's spaces", async () => {
      const slugs = (await listPublishedSpaces({ city })).map((s) => s.slug);
      expect(slugs).not.toContain(suspendedSlug);
    });

    it("still shows a verified organization's spaces", async () => {
      const slugs = (await listPublishedSpaces({ city })).map((s) => s.slug);
      expect(slugs).toContain(verifiedSlug);
    });

    it("shows an organization awaiting verification, per the Phase 1 threshold", async () => {
      // Deliberate: there is no route to VERIFIED yet other than a manual
      // database write, so requiring it would hide every genuine signup.
      // Phase 2 tightens this once the Verification workflow exists, and this
      // expectation is expected to flip with it.
      const slugs = (await listPublishedSpaces({ city })).map((s) => s.slug);
      expect(slugs).toContain(pendingSlug);
    });
  });

  describe("public space detail page", () => {
    it("returns null for a suspended organization's space, so the URL 404s", async () => {
      // Hiding it from search but serving it by slug would leave every
      // already-shared link live.
      expect(await getPublishedSpaceBySlug(suspendedSlug)).toBeNull();
    });

    it("returns a verified organization's space", async () => {
      expect(await getPublishedSpaceBySlug(verifiedSlug)).not.toBeNull();
    });
  });

  describe("assertOrganizationCanPublish", () => {
    it("refuses a suspended organization with 403", async () => {
      await expect(assertOrganizationCanPublish(suspendedOrgId)).rejects.toMatchObject({
        status: 403,
      });
    });

    it("allows a verified organization", async () => {
      await expect(assertOrganizationCanPublish(verifiedOrgId)).resolves.toMatchObject({
        status: "VERIFIED",
      });
    });

    it("allows an organization awaiting verification, for now", async () => {
      await expect(assertOrganizationCanPublish(pendingOrgId)).resolves.toMatchObject({
        status: "PENDING_VERIFICATION",
      });
    });

    it("answers 404 for an unknown organization", async () => {
      await expect(
        assertOrganizationCanPublish("00000000-0000-0000-0000-000000000000")
      ).rejects.toMatchObject({ status: 404 });
    });

    it("reads the status from the database, not from the caller", async () => {
      const { prisma } = await import("@/server/db/prisma");
      // Flip it underneath and the guard must follow immediately: nothing is
      // cached, and no caller-supplied status is trusted.
      await prisma.organization.update({
        where: { id: pendingOrgId },
        data: { status: "SUSPENDED" },
      });
      await expect(assertOrganizationCanPublish(pendingOrgId)).rejects.toMatchObject({
        status: 403,
      });
      await prisma.organization.update({
        where: { id: pendingOrgId },
        data: { status: "PENDING_VERIFICATION" },
      });
    });
  });
});
