import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasRealBackend } from "./helpers/should-run";

// Unlike auth-register.test.ts, this one calls the domain function
// directly (no next/headers involved) so it doesn't need a running server
// — only a real DATABASE_URL. Still gated behind INTEGRATION=1 since it
// writes real rows.
describe.skipIf(!hasRealBackend)("tenant isolation — organization A cannot see organization B's spaces", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let listOrgSpaces: typeof import("@/server/domains/spaces/list-org-spaces").listOrgSpaces;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    ({ listOrgSpaces } = await import("@/server/domains/spaces/list-org-spaces"));

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({
        data: {
          name: `Test Org A ${suffix}`,
          siret: String(Date.now()).padEnd(14, "1").slice(0, 14),
          email: `orga-${suffix}@test.local`,
          address: "1 rue A",
          city: "Paris",
          postalCode: "75001",
        },
      }),
      prisma.organization.create({
        data: {
          name: `Test Org B ${suffix}`,
          siret: String(Date.now()).padEnd(14, "2").slice(0, 14),
          email: `orgb-${suffix}@test.local`,
          address: "1 rue B",
          city: "Lyon",
          postalCode: "69001",
        },
      }),
    ]);
    orgAId = orgA.id;
    orgBId = orgB.id;

    await prisma.space.create({
      data: {
        organizationId: orgAId,
        slug: `space-a-${suffix}`,
        name: "Space A",
        type: "MEETING_ROOM",
        description: "Belongs to org A",
        address: "1 rue A",
        city: "Paris",
        postalCode: "75001",
        capacity: 4,
        amenities: [],
        photos: [],
        halfDayPriceCents: 1000,
        dayPriceCents: 2000,
        status: "PUBLISHED",
      },
    });
  });

  afterAll(async () => {
    await prisma.space.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.$disconnect();
  });

  it("org A sees its own space", async () => {
    const spaces = await listOrgSpaces(orgAId);
    expect(spaces).toHaveLength(1);
    expect(spaces[0].name).toBe("Space A");
  });

  it("org B sees zero spaces — never org A's", async () => {
    const spaces = await listOrgSpaces(orgBId);
    expect(spaces).toHaveLength(0);
  });
});
