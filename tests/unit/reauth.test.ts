import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInMock = vi.fn();
const signOutMock = vi.fn();
const createClientMock = vi.fn(() => ({ auth: { signInWithPassword: signInMock, signOut: signOutMock } }));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

const { verifyCurrentPassword, assertCurrentPassword, InvalidCurrentPasswordError } = await import(
  "@/server/domains/users/reauth"
);
const { clearedMetadata } = await import("@/server/domains/users/gdpr");

beforeEach(() => {
  signInMock.mockReset();
  signOutMock.mockReset().mockResolvedValue({ error: null });
  createClientMock.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

describe("verifyCurrentPassword", () => {
  it("uses a throwaway, non-persisting client so the caller's session cookies are untouched", async () => {
    signInMock.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    expect(await verifyCurrentPassword("a@example.com", "pw")).toBe(true);
    expect(createClientMock).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "anon",
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false, autoRefreshToken: false }) })
    );
    // The session created by the check is revoked, not left lying around.
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
  });

  it("returns false on a wrong password, and assertCurrentPassword throws a 403", async () => {
    signInMock.mockResolvedValue({ data: { session: null }, error: { code: "invalid_credentials" } });
    expect(await verifyCurrentPassword("a@example.com", "bad")).toBe(false);
    await expect(assertCurrentPassword("a@example.com", "bad")).rejects.toBeInstanceOf(InvalidCurrentPasswordError);
    await expect(assertCurrentPassword("a@example.com", "bad")).rejects.toMatchObject({ status: 403 });
  });
});

describe("clearedMetadata (SEC-10)", () => {
  it("sends every key — signup keys and any other — as null, since GoTrue merges metadata", () => {
    const cleared = clearedMetadata({ name: "Sam", phone: "0600000000", custom: "x" });
    expect(cleared).toMatchObject({ name: null, phone: null, custom: null, role: null, organization_siret: null });
    expect(Object.values(cleared).every((v) => v === null)).toBe(true);
  });

  it("still clears the signup keys when the current metadata could not be read", () => {
    expect(clearedMetadata(undefined)).toMatchObject({ name: null, phone: null });
  });
});
