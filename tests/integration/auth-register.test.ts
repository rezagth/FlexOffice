import { afterAll, describe, expect, it } from "vitest";
import { baseUrl, hasServer } from "./helpers/should-run";

describe.skipIf(!hasServer)("POST /api/auth/register (real server + Supabase)", () => {
  const createdEmails: string[] = [];

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

  function uniqueEmail(prefix: string) {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.officeflex.local`;
    createdEmails.push(email);
    return email;
  }

  async function register(body: unknown) {
    return fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("creates a CLIENT profile with no organization", async () => {
    const { prisma } = await import("@/server/db/prisma");
    const email = uniqueEmail("client");

    const res = await register({
      role: "CLIENT",
      email,
      password: "supersecret",
      name: "Test Client",
      acceptTerms: true,
    });

    expect(res.status).toBe(201);
    // No user id in the response since SEC-15: look the profile up instead.
    const profile = await prisma.profile.findUnique({ where: { email } });
    expect(profile?.role).toBe("CLIENT");
    expect(profile?.termsAcceptedAt).not.toBeNull();
    expect(profile?.organizationId).toBeNull();
  });

  it("creates a PARTNER profile AND its organization atomically", async () => {
    const { prisma } = await import("@/server/db/prisma");
    const email = uniqueEmail("partner");
    const siret = String(Date.now()).padEnd(14, "0").slice(0, 14);

    const res = await register({
      role: "PARTNER",
      email,
      password: "supersecret",
      name: "Test Partner",
      acceptTerms: true,
      organizationName: "Test Org",
      organizationSiret: siret,
      organizationAddress: "1 rue de Test",
      organizationCity: "Paris",
      organizationPostalCode: "75001",
    });

    expect(res.status).toBe(201);
    const profile = await prisma.profile.findUniqueOrThrow({ where: { email } });
    expect(profile.role).toBe("PARTNER");
    expect(profile.organizationId).not.toBeNull();

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: profile.organizationId! },
    });
    expect(org.siret).toBe(siret);
    expect(org.status).toBe("PENDING_VERIFICATION");
  });

  // Was "rejects a duplicate email with 409". SEC-15 makes that answer an
  // enumeration oracle, so a known address now gets exactly the answer a new
  // one gets — the stricter property, asserted on status AND body.
  it("answers a duplicate email exactly like a new one (no enumeration), never a 500", async () => {
    const email = uniqueEmail("dup");
    const payload = { role: "CLIENT", email, password: "supersecret", name: "Dup Client", acceptTerms: true };

    const first = await register(payload);
    const second = await register(payload);
    expect(second.status).toBe(first.status);
    expect(await second.json()).toEqual(await first.json());
  });

  it("rejects an invalid payload with 400", async () => {
    const res = await register({ role: "CLIENT", email: "not-an-email", password: "x" });
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated access to an admin endpoint with 401", async () => {
    const res = await fetch(`${baseUrl}/api/admin/organizations`);
    expect(res.status).toBe(401);
  });
});
