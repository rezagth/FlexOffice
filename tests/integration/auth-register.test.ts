import { afterAll, describe, expect, it } from "vitest";
import { baseUrl, hasRealBackend } from "./helpers/should-run";

describe.skipIf(!hasRealBackend)("POST /api/auth/register (real server + Supabase)", () => {
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
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    const profile = await prisma.profile.findUnique({ where: { id: body.userId } });
    expect(profile?.role).toBe("CLIENT");
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
      organizationName: "Test Org",
      organizationSiret: siret,
      organizationAddress: "1 rue de Test",
      organizationCity: "Paris",
      organizationPostalCode: "75001",
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: body.userId } });
    expect(profile.role).toBe("PARTNER");
    expect(profile.organizationId).not.toBeNull();

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: profile.organizationId! },
    });
    expect(org.siret).toBe(siret);
    expect(org.status).toBe("PENDING_VERIFICATION");
  });

  it("rejects a duplicate email with 409, not a 500", async () => {
    const email = uniqueEmail("dup");
    const payload = { role: "CLIENT", email, password: "supersecret", name: "Dup Client" };

    expect((await register(payload)).status).toBe(201);
    expect((await register(payload)).status).toBe(409);
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
