import { beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * The landlord "premiers pas" checklist follows the real state of the
 * organization step by step, and never claims a step it cannot see done.
 */
describe.skipIf(!hasDatabase)("landlord onboarding checklist", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let fixtures: typeof import("./helpers/test-fixtures");
  let onboarding: typeof import("@/server/domains/organizations/onboarding");
  let profileId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    fixtures = await import("./helpers/test-fixtures");
    onboarding = await import("@/server/domains/organizations/onboarding");
    profileId = (await fixtures.createTestUser({ role: "CLIENT", name: "Onboarding Landlord" })).id;
  });

  const state = (result: Awaited<ReturnType<typeof onboarding.getLandlordOnboarding>>) =>
    Object.fromEntries(result.steps.map((s) => [s.id, s.state]));

  it("walks from a brand-new organization to a published listing", async () => {
    const org = await fixtures.createTestOrganization({ name: "Onboarding Org" });
    const verification = await prisma.landlordVerification.create({
      data: { organizationId: org.id, requestedByProfileId: profileId, activityType: "OWNER" },
    });

    let result = await onboarding.getLandlordOnboarding(org.id, { stripeEnabled: false });
    expect(result.steps.map((s) => s.id)).toEqual(["verification", "property", "space", "photos", "publish"]);
    expect(state(result)).toEqual({
      verification: "todo",
      property: "todo",
      space: "todo",
      photos: "todo",
      publish: "todo",
    });
    expect(result.steps[0].href).toBe("/app/landlord/verification");

    await prisma.landlordVerification.update({ where: { id: verification.id }, data: { status: "PENDING_REVIEW" } });
    result = await onboarding.getLandlordOnboarding(org.id, { stripeEnabled: false });
    expect(state(result).verification).toBe("waiting");

    await prisma.landlordVerification.update({ where: { id: verification.id }, data: { status: "APPROVED" } });
    await prisma.organization.update({ where: { id: org.id }, data: { status: "VERIFIED" } });
    const property = await fixtures.createTestProperty(org.id, profileId);
    const space = await fixtures.createTestSpace(org.id, property.id, { status: "DRAFT" });

    result = await onboarding.getLandlordOnboarding(org.id, { stripeEnabled: false });
    expect(state(result)).toMatchObject({ verification: "done", property: "done", space: "done", photos: "todo", publish: "todo" });
    expect(result.steps.find((s) => s.id === "photos")?.href).toBe(`/app/landlord/spaces/${space.id}/edit`);
    expect(result.steps.find((s) => s.id === "publish")?.href).toBe(
      `/app/landlord/properties/${property.id}/spaces/${space.id}`
    );

    for (let i = 0; i < onboarding.RECOMMENDED_PHOTO_COUNT; i++) {
      await prisma.spacePhoto.create({
        data: { spaceId: space.id, storagePath: `test/${space.id}/${i}.jpg`, mimeType: "image/jpeg", position: i },
      });
    }
    await prisma.space.update({ where: { id: space.id }, data: { status: "PENDING_REVIEW" } });
    result = await onboarding.getLandlordOnboarding(org.id, { stripeEnabled: false });
    expect(state(result)).toMatchObject({ photos: "done", publish: "waiting" });
    expect(result.complete).toBe(false);

    await prisma.space.update({ where: { id: space.id }, data: { status: "PUBLISHED" } });
    result = await onboarding.getLandlordOnboarding(org.id, { stripeEnabled: false });
    expect(result.complete).toBe(true);
    expect(result.doneCount).toBe(5);

    // Unpublished by moderation: the step opens again.
    await prisma.space.update({ where: { id: space.id }, data: { status: "REJECTED" } });
    result = await onboarding.getLandlordOnboarding(org.id, { stripeEnabled: false });
    expect(state(result).publish).toBe("todo");
  });

  it("adds the payouts step when real payments are on, and survives Stripe being unreachable", async () => {
    const org = await fixtures.createTestOrganization({ name: "Onboarding Stripe Org" });
    await prisma.organization.update({ where: { id: org.id }, data: { stripeAccountId: "acct_unreachable" } });
    const previous = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY; // the Stripe client cannot be built: the call throws
    try {
      const result = await onboarding.getLandlordOnboarding(org.id, { stripeEnabled: true });
      const payouts = result.steps.find((s) => s.id === "payouts");
      expect(payouts?.state).toBe("todo");
      expect(result.steps.map((s) => s.id)).toContain("payouts");
    } finally {
      if (previous !== undefined) process.env.STRIPE_SECRET_KEY = previous;
    }
  });
});
