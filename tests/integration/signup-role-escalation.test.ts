import { afterAll, describe, expect, it } from "vitest";
import { hasRealBackend } from "./helpers/should-run";

/**
 * Regression test for S-01 (privilege escalation at signup).
 *
 * This test deliberately does NOT go through POST /api/auth/register. The
 * whole point of S-01 was that an attacker skips the app entirely and posts
 * to Supabase's own /auth/v1/signup with the public anon key, so the Zod
 * union in src/lib/validation/auth.ts never runs. A test that went through
 * the app's route would have passed happily while the hole was wide open.
 *
 * It therefore uses the anon client directly — exactly what a hostile
 * browser can do — and asserts the database refuses to hand out the role.
 *
 * Fails if the whitelist in prisma/migrations/*_harden_signup_role_whitelist
 * is removed or weakened.
 */
describe.skipIf(!hasRealBackend)("signup cannot self-assign a privileged role", () => {
  const createdEmails: string[] = [];

  function uniqueEmail(prefix: string) {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.officeflex.local`;
    createdEmails.push(email);
    return email;
  }

  async function anonSignUp(email: string, data: Record<string, string>) {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    return anon.auth.signUp({ email, password: "supersecret", options: { data } });
  }

  afterAll(async () => {
    if (createdEmails.length === 0) return;
    const { createSupabaseAdminClient } = await import("@/server/auth/supabase-admin");
    const admin = createSupabaseAdminClient();
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    for (const email of createdEmails) {
      const user = data.users.find((u) => u.email === email);
      if (user) await admin.auth.admin.deleteUser(user.id);
    }
  });

  it("downgrades an injected ADMIN role to CLIENT", async () => {
    const { prisma } = await import("@/server/db/prisma");
    const email = uniqueEmail("escalation-admin");

    const { data, error } = await anonSignUp(email, { role: "ADMIN", name: "Attacker" });

    // The signup itself succeeds — the whitelist is silent on purpose, so a
    // probe looks exactly like an ordinary CLIENT signup.
    expect(error).toBeNull();
    expect(data.user).not.toBeNull();

    const profile = await prisma.profile.findUnique({ where: { id: data.user!.id } });
    expect(profile?.role).toBe("CLIENT");
    expect(profile?.organizationId).toBeNull();
  });

  it("downgrades an unknown role to CLIENT", async () => {
    const { prisma } = await import("@/server/db/prisma");
    const email = uniqueEmail("escalation-junk");

    const { data, error } = await anonSignUp(email, { role: "SUPERUSER", name: "Attacker" });

    expect(error).toBeNull();
    const profile = await prisma.profile.findUnique({ where: { id: data.user!.id } });
    expect(profile?.role).toBe("CLIENT");
  });

  it("rejects a PARTNER signup whose SIRET bypasses the Zod schema", async () => {
    const email = uniqueEmail("escalation-siret");

    const { data, error } = await anonSignUp(email, {
      role: "PARTNER",
      name: "Attacker",
      organization_name: "Fake Org",
      organization_siret: "123",
      organization_address: "1 rue X",
      organization_city: "Paris",
      organization_postal_code: "75001",
    });

    // The trigger raises, which aborts the auth.users insert: no auth user,
    // no profile, no organization.
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("still creates a normal PARTNER signup and its organization", async () => {
    const { prisma } = await import("@/server/db/prisma");
    const email = uniqueEmail("escalation-partner-ok");
    const siret = String(Date.now()).padEnd(14, "7").slice(0, 14);

    const { data, error } = await anonSignUp(email, {
      role: "PARTNER",
      name: "Julie Martin",
      organization_name: "Atelier Test",
      organization_siret: siret,
      organization_address: "12 rue de Rivoli",
      organization_city: "Paris",
      organization_postal_code: "75004",
    });

    expect(error).toBeNull();
    const profile = await prisma.profile.findUnique({ where: { id: data.user!.id } });
    expect(profile?.role).toBe("PARTNER");
    expect(profile?.organizationId).not.toBeNull();
  });
});
