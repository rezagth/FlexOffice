import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, UnauthorizedError } from "@/server/lib/errors";

const requireAuthMock = vi.fn();
const updateOwnProfileMock = vi.fn();
const updateUserMock = vi.fn();
const recordAuditMock = vi.fn();
const deleteOwnAccountMock = vi.fn();
const signOutMock = vi.fn();

vi.mock("@/server/auth/rbac", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/server/lib/audit", () => ({ recordAudit: recordAuditMock }));
vi.mock("@/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { updateUser: updateUserMock, signOut: signOutMock } }),
}));
vi.mock("@/server/domains/users/profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/domains/users/profile")>()),
  updateOwnProfile: updateOwnProfileMock,
}));
vi.mock("@/server/domains/users/gdpr", () => ({ deleteOwnAccount: deleteOwnAccountMock }));

const { PATCH: patchProfile } = await import("@/app/api/account/profile/route");
const { POST: changeEmail } = await import("@/app/api/account/email/route");
const { POST: deleteAccount } = await import("@/app/api/client/gdpr/delete/route");
const { EMAIL_CHANGE_MESSAGE } = await import("@/server/domains/users/profile");
const { InvalidCurrentPasswordError } = await import("@/server/domains/users/reauth");
const { resetRateLimitStoreForTests } = await import("@/server/auth/rate-limit");

function request(url: string, method: string, body: unknown) {
  return new Request(`http://test.local${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetRateLimitStoreForTests();
  requireAuthMock.mockReset().mockResolvedValue({ userId: "user-a", email: "a@example.com" });
  updateOwnProfileMock.mockReset().mockResolvedValue({ name: "Sam", phone: null, email: "a@example.com" });
  updateUserMock.mockReset();
  recordAuditMock.mockReset().mockResolvedValue(undefined);
  deleteOwnAccountMock.mockReset();
  signOutMock.mockReset().mockResolvedValue({ error: null });
  process.env.APP_URL = "https://app.officeflex.test";
});

describe("PATCH /api/account/profile (FCT-18)", () => {
  it("updates the session's own profile, ignoring any id or email in the body", async () => {
    const res = await patchProfile(
      request("/api/account/profile", "PATCH", { name: "Sam", phone: "", id: "user-b", email: "x@y.z" })
    );
    expect(res.status).toBe(200);
    expect(updateOwnProfileMock).toHaveBeenCalledWith("user-a", { name: "Sam", phone: null });
  });

  it("requires a session", async () => {
    requireAuthMock.mockRejectedValue(new UnauthorizedError());
    const res = await patchProfile(request("/api/account/profile", "PATCH", { name: "Sam" }));
    expect(res.status).toBe(401);
    expect(updateOwnProfileMock).not.toHaveBeenCalled();
  });

  it("rejects an empty name with a French field message", async () => {
    const res = await patchProfile(request("/api/account/profile", "PATCH", { name: "  " }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.issues[0].message).toBe("Nom requis.");
  });
});

describe("POST /api/account/email (FCT-18)", () => {
  it("asks Supabase for a confirmed change, with the link on APP_URL", async () => {
    updateUserMock.mockResolvedValue({ data: {}, error: null });
    const res = await changeEmail(request("/api/account/email", "POST", { email: "new@example.com" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ message: EMAIL_CHANGE_MESSAGE });
    expect(updateUserMock).toHaveBeenCalledWith(
      { email: "new@example.com" },
      { emailRedirectTo: "https://app.officeflex.test/auth/confirm?next=%2Fapp%2Faccount%3Femail%3Dconfirmed" }
    );
  });

  it("answers an address already in use exactly like a success (no enumeration)", async () => {
    updateUserMock.mockResolvedValue({ data: null, error: { code: "email_exists", status: 422, message: "taken" } });
    const res = await changeEmail(request("/api/account/email", "POST", { email: "taken@example.com" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ message: EMAIL_CHANGE_MESSAGE });
  });

  it("refuses the current address", async () => {
    const res = await changeEmail(request("/api/account/email", "POST", { email: "A@example.com" }));
    expect(res.status).toBe(400);
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/client/gdpr/delete (SEC-10, FCT-19)", () => {
  it("requires the current password in the body", async () => {
    const res = await deleteAccount(request("/api/client/gdpr/delete", "POST", {}));
    expect(res.status).toBe(400);
    expect(deleteOwnAccountMock).not.toHaveBeenCalled();
  });

  it("passes the SESSION's identity and the password to the domain", async () => {
    deleteOwnAccountMock.mockResolvedValue({ mode: "anonymized" });
    const res = await deleteAccount(
      request("/api/client/gdpr/delete", "POST", { password: "secret", userId: "user-b" })
    );
    expect(res.status).toBe(200);
    expect(deleteOwnAccountMock).toHaveBeenCalledWith({ userId: "user-a", email: "a@example.com", password: "secret" });
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
  });

  it("maps a wrong password to 403 INVALID_PASSWORD", async () => {
    deleteOwnAccountMock.mockRejectedValue(new InvalidCurrentPasswordError());
    const res = await deleteAccount(request("/api/client/gdpr/delete", "POST", { password: "wrong" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("INVALID_PASSWORD");
  });

  it("maps live bookings to 409 with the French message", async () => {
    deleteOwnAccountMock.mockRejectedValue(new ConflictError("Vous avez une réservation en cours ou à venir."));
    const res = await deleteAccount(request("/api/client/gdpr/delete", "POST", { password: "secret" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/réservation/);
  });
});
