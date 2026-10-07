import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/** B-26: the only way to create the first production administrator. */
describe.skipIf(!hasDatabase)("setPlatformAdmin", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let setPlatformAdmin: typeof import("@/server/domains/admin/promote-admin").setPlatformAdmin;
  let fixtures: typeof import("./helpers/test-fixtures");
  let user: { id: string; email: string };

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    ({ setPlatformAdmin } = await import("@/server/domains/admin/promote-admin"));
    fixtures = await import("./helpers/test-fixtures");
    // Signup metadata asking for ADMIN must not matter (whitelisted by the trigger).
    user = await fixtures.createTestUser({ role: "ADMIN", name: "Future Admin" });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { metadata: { path: ["profileId"], equals: user.id } } });
    await fixtures.deleteTestUser(user.id);
    await prisma.$disconnect();
  });

  it("starts as a plain user whatever the signup metadata said", async () => {
    expect((await prisma.profile.findUniqueOrThrow({ where: { id: user.id } })).platformRole).toBe("USER");
  });

  it("promotes, case-insensitively, and records who did it", async () => {
    const result = await setPlatformAdmin({ email: user.email.toUpperCase(), admin: true, operator: "noam" });
    expect(result).toMatchObject({ changed: true, platformRole: "ADMIN" });
    const audit = await prisma.auditLog.findFirst({ where: { event: "admin.promoted", metadata: { path: ["profileId"], equals: user.id } } });
    expect(audit?.metadata).toMatchObject({ operator: "noam" });
  });

  it("is idempotent, and demotes", async () => {
    expect((await setPlatformAdmin({ email: user.email, admin: true, operator: "noam" })).changed).toBe(false);
    expect(await setPlatformAdmin({ email: user.email, admin: false, operator: "noam" })).toMatchObject({ changed: true, platformRole: "USER" });
  });

  it("never creates an account", async () => {
    await expect(setPlatformAdmin({ email: "nobody@example.invalid", admin: true, operator: "x" })).rejects.toThrow(/No active account/);
  });
});
