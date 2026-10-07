import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Per-account limits on state-changing routes that had none
 * (audit 06/10/2026, SEC-04 / SEC-06).
 */

const requireAuthMock = vi.fn();
const createBookingMock = vi.fn();
const deleteProfileMock = vi.fn();

vi.mock("@/server/auth/rbac", () => ({ requireAuth: requireAuthMock, requireOrg: requireAuthMock }));
vi.mock("@/server/domains/properties/access", () => ({
  requirePropertyManageAccess: async () => ({ ctx: await requireAuthMock() }),
}));
// Domain calls are never reached past the limit; stubs keep earlier calls cheap.
vi.mock("@/server/domains/messaging/conversation", () => ({ listMessages: vi.fn(), sendMessage: vi.fn() }));
vi.mock("@/server/domains/disputes/raise", () => ({ raiseDispute: vi.fn() }));
vi.mock("@/server/domains/favorites/favorites", () => ({ addFavorite: vi.fn(), removeFavorite: vi.fn() }));
vi.mock("@/server/domains/organizations/photos", () => ({ addSpacePhoto: vi.fn(), removeSpacePhoto: vi.fn() }));
vi.mock("@/server/domains/properties/photos", () => ({ addPropertyPhoto: vi.fn(), listPropertyPhotos: vi.fn() }));
vi.mock("@/server/domains/properties/spaces", () => ({ getSpaceForProperty: vi.fn() }));
vi.mock("@/server/domains/properties/space-photos", () => ({ addSpacePhoto: vi.fn(), listSpacePhotos: vi.fn() }));
vi.mock("@/server/domains/users/switch-mode", () => ({ switchMode: vi.fn(async () => ({})) }));
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
    body: JSON.stringify({ spaceId: SPACE, date: "2026-12-01", slot: "MORNING", participantsCount: 4, purpose: "Réunion", acceptTerms: true }),
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

describe("every state-changing route listed in the audit answers 429 past its limit", () => {
  // Behavioural, not a grep: each handler is called past its limit and must
  // refuse. Requests before that may fail validation (empty bodies) — they
  // still count, which is the point: the limit runs before any work.
  type Handler = (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
  const cases: { name: string; load: () => Promise<Handler>; method: string; limit: number }[] = [
    { name: "POST /api/bookings/[id]/messages", load: async () => (await import("@/app/api/bookings/[id]/messages/route")).POST as Handler, method: "POST", limit: RATE_LIMITS.messageSend.limit },
    { name: "POST /api/bookings/[id]/disputes", load: async () => (await import("@/app/api/bookings/[id]/disputes/route")).POST as Handler, method: "POST", limit: RATE_LIMITS.disputeRaise.limit },
    { name: "POST /api/favorites", load: async () => (await import("@/app/api/favorites/route")).POST as Handler, method: "POST", limit: RATE_LIMITS.favoriteToggle.limit },
    { name: "DELETE /api/favorites/[spaceId]", load: async () => (await import("@/app/api/favorites/[spaceId]/route")).DELETE as Handler, method: "DELETE", limit: RATE_LIMITS.favoriteToggle.limit },
    { name: "POST /api/partner/spaces/[id]/photos", load: async () => (await import("@/app/api/partner/spaces/[id]/photos/route")).POST as Handler, method: "POST", limit: RATE_LIMITS.photoUpload.limit },
    { name: "POST /api/properties/[id]/photos", load: async () => (await import("@/app/api/properties/[id]/photos/route")).POST as Handler, method: "POST", limit: RATE_LIMITS.photoUpload.limit },
    { name: "POST /api/properties/[id]/spaces/[spaceId]/photos", load: async () => (await import("@/app/api/properties/[id]/spaces/[spaceId]/photos/route")).POST as Handler, method: "POST", limit: RATE_LIMITS.photoUpload.limit },
    { name: "PUT /api/account/mode", load: async () => (await import("@/app/api/account/mode/route")).PUT as Handler, method: "PUT", limit: RATE_LIMITS.accountModeSwitch.limit },
  ];

  it.each(cases)("$name", async ({ load, method, limit }) => {
    const handler = await load();
    const params = Promise.resolve({ id: SPACE, spaceId: SPACE });
    const call = () =>
      handler(
        new Request("http://test.local/api/x", {
          method,
          headers: { "Content-Type": "application/json" },
          body: method === "DELETE" ? undefined : "{}",
        }),
        { params }
      );
    for (let i = 0; i < limit; i++) expect((await call()).status).not.toBe(429);
    expect((await call()).status).toBe(429);
  });
});
