import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * Phone verification (PRD V1.1, 2B) against a real database:
 *  - the full request -> confirm cycle for both INITIAL_VERIFICATION and
 *    NUMBER_CHANGE (R51 — the code goes to the OLD number, not the new one);
 *  - the database itself refuses a second profile claiming an already
 *    verified number (profiles_verified_phone_unique, a partial unique
 *    index not expressible in Prisma's schema DSL);
 *  - assertProfileIsComplete()'s behavior under both values of
 *    PHONE_VERIFICATION_REQUIRED, exercised through createBooking() exactly
 *    as a real booking attempt would.
 *
 * Codes are hashed before storage (phone-verification.ts) — this test
 * cracks the 6-digit, 1,000,000-value space directly rather than exporting
 * a test-only hook, which also doubles as an honest demonstration that the
 * hash is not meant to resist that: the real protections are the 10-minute
 * expiry, single use, and 5-attempt lockout, none of which this bypasses.
 */
describe.skipIf(!hasDatabase)("phone verification", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let requestPhoneVerificationCode: typeof import(
    "@/server/domains/users/phone-verification"
  ).requestPhoneVerificationCode;
  let confirmPhoneVerificationCode: typeof import(
    "@/server/domains/users/phone-verification"
  ).confirmPhoneVerificationCode;
  let createBooking: typeof import("@/server/domains/bookings/create-booking").createBooking;
  let ConflictError: typeof import("@/server/lib/errors").ConflictError;
  let ForbiddenError: typeof import("@/server/lib/errors").ForbiddenError;
  let fixtures: typeof import("./helpers/test-fixtures");

  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    ({ requestPhoneVerificationCode, confirmPhoneVerificationCode } = await import(
      "@/server/domains/users/phone-verification"
    ));
    ({ createBooking } = await import("@/server/domains/bookings/create-booking"));
    ({ ConflictError, ForbiddenError } = await import("@/server/lib/errors"));
    fixtures = await import("./helpers/test-fixtures");
  });

  afterAll(async () => {
    for (const userId of cleanupUserIds) {
      await prisma.phoneVerificationCode.deleteMany({ where: { profileId: userId } });
      await fixtures.deleteTestUser(userId);
    }
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });

  function crackCode(hash: string): string {
    for (let i = 0; i < 1_000_000; i++) {
      const candidate = String(i).padStart(6, "0");
      if (createHash("sha256").update(candidate).digest("hex") === hash) return candidate;
    }
    throw new Error("6-digit code not found by brute force — should be unreachable");
  }

  async function latestCode(profileId: string) {
    const record = await prisma.phoneVerificationCode.findFirst({
      where: { profileId },
      orderBy: { createdAt: "desc" },
    });
    if (!record) throw new Error("no code row found");
    return { record, code: crackCode(record.codeHash) };
  }

  it("verifies a candidate number end to end (INITIAL_VERIFICATION)", async () => {
    const user = await fixtures.createTestUser({ role: "CLIENT", name: "Phone A", phone: "" });
    cleanupUserIds.push(user.id);

    const requested = await requestPhoneVerificationCode(user.id, "0611111111");
    expect(requested.purpose).toBe("INITIAL_VERIFICATION");

    const { code } = await latestCode(user.id);
    const confirmed = await confirmPhoneVerificationCode(user.id, code);
    expect(confirmed.phone).toBe("0611111111");

    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: user.id } });
    expect(profile.phone).toBe("0611111111");
    expect(profile.phoneVerifiedAt).not.toBeNull();
  });

  it("changing an already-verified number sends the code to the OLD number and applies the new one on success (R51)", async () => {
    const user = await fixtures.createTestUser({ role: "CLIENT", name: "Phone B", phone: "" });
    cleanupUserIds.push(user.id);

    await requestPhoneVerificationCode(user.id, "0622222222");
    const first = await latestCode(user.id);
    await confirmPhoneVerificationCode(user.id, first.code);

    // Now verified at 0622222222 — request a change to a third number.
    const changeRequest = await requestPhoneVerificationCode(user.id, "0633333333");
    expect(changeRequest.purpose).toBe("NUMBER_CHANGE");
    const second = await latestCode(user.id);
    expect(second.record.phone).toBe("0622222222"); // sent to the OLD number
    expect(second.record.pendingNewPhone).toBe("0633333333");

    const confirmed = await confirmPhoneVerificationCode(user.id, second.code);
    expect(confirmed.phone).toBe("0633333333");
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: user.id } });
    expect(profile.phone).toBe("0633333333");
    expect(profile.phoneVerifiedAt).not.toBeNull();
  });

  it("the database refuses a second profile claiming an already-verified number", async () => {
    const first = await fixtures.createTestUser({ role: "CLIENT", name: "Phone Owner", phone: "" });
    const second = await fixtures.createTestUser({ role: "CLIENT", name: "Phone Claimant", phone: "" });
    cleanupUserIds.push(first.id, second.id);

    await requestPhoneVerificationCode(first.id, "0644444444");
    const { code: firstCode } = await latestCode(first.id);
    await confirmPhoneVerificationCode(first.id, firstCode);

    await requestPhoneVerificationCode(second.id, "0644444444");
    const { code: secondCode } = await latestCode(second.id);
    await expect(confirmPhoneVerificationCode(second.id, secondCode)).rejects.toBeInstanceOf(ConflictError);

    const secondProfile = await prisma.profile.findUniqueOrThrow({ where: { id: second.id } });
    expect(secondProfile.phoneVerifiedAt).toBeNull();
  });

  it("a wrong code 5 times exhausts it, and a 6th (even correct) guess is refused", async () => {
    const user = await fixtures.createTestUser({ role: "CLIENT", name: "Phone Attempts", phone: "" });
    cleanupUserIds.push(user.id);

    await requestPhoneVerificationCode(user.id, "0655555555");
    const { code } = await latestCode(user.id);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      await expect(confirmPhoneVerificationCode(user.id, wrong)).rejects.toThrow();
    }
    await expect(confirmPhoneVerificationCode(user.id, code)).rejects.toThrow(/tentatives/);

    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: user.id } });
    expect(profile.phoneVerifiedAt).toBeNull();
  });

  describe("PHONE_VERIFICATION_REQUIRED switch, exercised through a real booking attempt", () => {
    let spaceId: string;
    let orgId: string;
    let propertyId: string;
    let clientId: string;

    beforeAll(async () => {
      const org = await fixtures.createTestOrganization({ name: "Phone Switch Org" });
      orgId = org.id;
      const client = await fixtures.createTestUser({ role: "CLIENT", name: "Phone Switch Client", phone: "" });
      clientId = client.id;
      cleanupUserIds.push(clientId);
      const property = await fixtures.createTestProperty(orgId, clientId);
      propertyId = property.id;
      const space = await fixtures.createTestSpace(orgId, propertyId);
      spaceId = space.id;
      await prisma.spaceOpeningHours.create({
        data: { spaceId, weekday: 1, opensAt: "09:00", closesAt: "18:00" }, // Monday, matches 2031-07-14
      });
      // Phone filled (fixture override below) but never verified — the
      // exact "predates the 2B column" / "never completed it" state.
      await prisma.profile.update({ where: { id: clientId }, data: { phone: "0600000000" } });
    });

    afterAll(async () => {
      await prisma.payment.deleteMany({ where: { organizationId: orgId } });
      await prisma.booking.deleteMany({ where: { spaceId } });
      await prisma.spaceOpeningHours.deleteMany({ where: { spaceId } });
      await prisma.space.deleteMany({ where: { id: spaceId } });
      await prisma.property.deleteMany({ where: { id: propertyId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    });

    it("true (default): a filled-but-unverified phone still blocks booking", async () => {
      vi.stubEnv("PHONE_VERIFICATION_REQUIRED", "true");
      await expect(
        createBooking(clientId, {
          spaceId,
          date: "2031-07-14", // a Monday, untouched by other suites
          slot: "MORNING",
          participantsCount: 2,
          purpose: "Switch true",
          acceptTerms: true,
        })
      ).rejects.toBeInstanceOf(ForbiddenError);
      vi.unstubAllEnvs();
    });

    it("false: a filled (but unverified) phone is enough to book", async () => {
      vi.stubEnv("PHONE_VERIFICATION_REQUIRED", "false");
      const { booking } = await createBooking(clientId, {
        spaceId,
        date: "2031-07-14",
        slot: "MORNING",
        participantsCount: 2,
        purpose: "Switch false",
        acceptTerms: true,
      });
      expect(booking.id).toBeTruthy();
      vi.unstubAllEnvs();
    });
  });
});
