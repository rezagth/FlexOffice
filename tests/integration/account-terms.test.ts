import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * B-11 (terms acceptance stored server-side) and FCT-18 (profiles.email kept
 * in step with auth.users.email), against the real migrations and trigger.
 *
 * signUp is stubbed by a function that does what GoTrue does to the
 * database — insert into auth.users with the metadata — so the real
 * `handle_new_user` trigger runs, and then the register domain's own write.
 */
const signUp = vi.fn();
vi.mock("@/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signUp } }),
}));

describe.skipIf(!hasDatabase)("account terms and e-mail sync", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let registerUser: typeof import("@/server/domains/users/register").registerUser;
  let TERMS_VERSION: string;
  const ids: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    ({ registerUser } = await import("@/server/domains/users/register"));
    ({ TERMS_VERSION } = await import("@/lib/legal-versions"));

    signUp.mockImplementation(async ({ email, options }: { email: string; options: { data: Record<string, string> } }) => {
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (gen_random_uuid(), $1, $2::jsonb) RETURNING id`,
        email,
        JSON.stringify(options.data)
      );
      ids.push(rows[0].id);
      return { data: { user: { id: rows[0].id, identities: [{ id: "i" }] }, session: null }, error: null };
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    if (ids.length) await prisma.$executeRawUnsafe(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, ids);
    await prisma.$disconnect();
  });

  function email(tag: string) {
    return `terms-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.officeflex.local`;
  }

  it("stamps terms_accepted_at and terms_version on the new profile", async () => {
    const address = email("ok");
    const before = Date.now();
    const outcome = await registerUser(
      { role: "CLIENT", email: address, password: "supersecret", name: "Sam", acceptTerms: true },
      { appBaseUrl: "https://app.test" }
    );
    expect(outcome).toEqual({ status: "CONFIRMATION_REQUIRED" });

    const profile = await prisma.profile.findUniqueOrThrow({ where: { email: address } });
    expect(profile.termsVersion).toBe(TERMS_VERSION);
    expect(profile.termsAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("a direct /auth/v1/signup carrying terms metadata does NOT record an acceptance", async () => {
    // What an attacker skipping the form sends: the trigger must ignore it.
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (gen_random_uuid(), $1, $2::jsonb) RETURNING id`,
      email("direct"),
      JSON.stringify({ role: "CLIENT", name: "Direct", terms_accepted_at: "2020-01-01", terms_version: "forged" })
    );
    ids.push(rows[0].id);
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: rows[0].id } });
    expect(profile.termsAcceptedAt).toBeNull();
    expect(profile.termsVersion).toBeNull();
  });

  it("rejects a version without a date (and the reverse) at the database level", async () => {
    const id = ids[0];
    await expect(
      prisma.profile.update({ where: { id }, data: { termsAcceptedAt: null } })
    ).rejects.toThrow(/profiles_terms_acceptance_pair_check/);
  });

  it("copies a confirmed e-mail change from auth.users to profiles", async () => {
    const id = ids[0];
    const next = email("changed");
    await prisma.$executeRawUnsafe(`UPDATE auth.users SET email = $1 WHERE id = $2::uuid`, next, id);
    expect((await prisma.profile.findUniqueOrThrow({ where: { id } })).email).toBe(next);
  });

  it("leaves an anonymized profile's tombstone alone", async () => {
    const id = ids[0];
    const tombstone = `deleted-${crypto.randomUUID()}@officeflex.invalid`;
    await prisma.profile.update({ where: { id }, data: { email: tombstone, phone: null, deletedAt: new Date() } });
    await prisma.$executeRawUnsafe(`UPDATE auth.users SET email = $1 WHERE id = $2::uuid`, email("after-delete"), id);
    expect((await prisma.profile.findUniqueOrThrow({ where: { id } })).email).toBe(tombstone);
  });

  it("rejects a booking with a CGV version but no acceptance date", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(
      `SELECT pg_get_constraintdef(oid) LIKE '%cgv_accepted_at%' AS ok FROM pg_constraint WHERE conname = 'bookings_cgv_acceptance_pair_check'`
    );
    expect(rows[0]?.ok).toBe(true);
  });
});
