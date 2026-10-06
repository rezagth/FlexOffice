import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Per-account limits on state-changing routes that had none
 * (audit 06/10/2026, SEC-04 / SEC-06).
 */

const requireAuthMock = vi.fn();
const createBookingMock = vi.fn();
const deleteProfileMock = vi.fn();

vi.mock("@/server/auth/rbac", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/server/domains/bookings/create-booking", () => ({ createBooking: createBookingMock }));
vi.mock("@/server/domains/users/gdpr", () => ({ deleteOrAnonymizeProfile: deleteProfileMock }));

const { POST: createBookingRoute } = await import("@/app/api/bookings/route");
const { POST: deleteAccountRoute } = await import("@/app/api/client/gdpr/delete/route");
const { resetRateLimitStoreForTests, RATE_LIMITS } = await import("@/server/auth/rate-limit");

const SPACE = "11111111-1111-4111-8111-111111111111";

function bookingRequest() {
  return new Request("http://test.local/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spaceId: SPACE, date: "2026-12-01", slot: "MORNING", participantsCount: 4, purpose: "Réunion" }),
  });
}

beforeEach(() => {
  resetRateLimitStoreForTests();
  requireAuthMock.mockReset().mockResolvedValue({ userId: `user-${Math.random()}` });
  createBookingMock.mockReset().mockResolvedValue({ booking: { id: "b1" }, clientSecret: undefined });
  deleteProfileMock.mockReset().mockResolvedValue({ mode: "deleted" });
});

describe("POST /api/bookings", () => {
  it("refuses the request past the per-account limit, before creating anything", async () => {
    const limit = RATE_LIMITS.bookingCreate.limit;
    for (let i = 0; i < limit; i++) {
      const res = await createBookingRoute(bookingRequest());
      expect(res.status).toBe(201);
    }
    createBookingMock.mockClear();

    const res = await createBookingRoute(bookingRequest());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("counts per account, not globally", async () => {
    for (let i = 0; i < RATE_LIMITS.bookingCreate.limit; i++) await createBookingRoute(bookingRequest());
    requireAuthMock.mockResolvedValue({ userId: "another-user" });
    expect((await createBookingRoute(bookingRequest())).status).not.toBe(429);
  });
});

describe("POST /api/client/gdpr/delete", () => {
  it("is limited", async () => {
    const req = () => new Request("http://test.local/api/client/gdpr/delete", { method: "POST" });
    for (let i = 0; i < RATE_LIMITS.accountDeletion.limit; i++) await deleteAccountRoute(req());
    expect((await deleteAccountRoute(req())).status).toBe(429);
  });
});

describe("every state-changing route listed in the audit is rate limited", () => {
  // Cheap guard against a limit being dropped during a refactor.
  const routes = [
    "src/app/api/bookings/route.ts",
    "src/app/api/bookings/[id]/messages/route.ts",
    "src/app/api/bookings/[id]/disputes/route.ts",
    "src/app/api/favorites/route.ts",
    "src/app/api/favorites/[spaceId]/route.ts",
    "src/app/api/partner/spaces/[id]/photos/route.ts",
    "src/app/api/properties/[id]/photos/route.ts",
    "src/app/api/properties/[id]/spaces/[spaceId]/photos/route.ts",
    "src/app/api/account/mode/route.ts",
    "src/app/api/client/gdpr/delete/route.ts",
  ];
  it.each(routes)("%s calls enforceRateLimit", (path) => {
    expect(readFileSync(path, "utf8")).toContain("enforceRateLimit(");
  });
});
