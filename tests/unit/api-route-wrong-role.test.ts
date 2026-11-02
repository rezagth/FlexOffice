import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Un utilisateur CONNECTÉ mais sans les droits (simple locataire) est refusé
 * en 403 sur toutes les routes d'administration et de bailleur, sans jamais
 * toucher la base. Complète api-route-guards.test.ts (anonyme → 401).
 */

vi.mock("@/server/auth/rbac", async () => {
  const errors = await import("@/server/lib/errors");
  const tenant = {
    userId: "tenant-1",
    email: "tenant@test.local",
    platformRole: "USER",
    role: "CLIENT",
    isLandlord: false,
    activeMode: "TENANT",
    activeOrgId: null,
    activeOrgRole: null,
    organizationId: null,
    capabilities: new Set<string>(),
  };
  const forbid = async () => {
    throw new errors.ForbiddenError();
  };
  return {
    getAuthContext: async () => tenant,
    requireAuth: async () => tenant,
    requireAdmin: forbid,
    requireRole: forbid,
    requireOrg: forbid,
    requireCapability: forbid,
    requireOrganizationAccess: forbid,
  };
});

vi.mock("@/server/db/prisma", () => {
  const boom = () => {
    throw new Error("DB_TOUCHED_BY_UNAUTHORIZED_USER");
  };
  const handler: ProxyHandler<object> = { get: () => new Proxy(boom, handler), apply: boom };
  return { prisma: new Proxy(boom, handler) };
});

vi.mock("@/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "tenant-1" } }, error: null }) },
  }),
}));

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const modules = import.meta.glob("/src/app/api/**/route.ts") as Record<string, () => Promise<Record<string, unknown>>>;

const routeOf = (file: string) => file.replace("/src/app", "").replace(/\/route\.ts$/, "");
const restricted = Object.keys(modules)
  .map((file) => ({ file, route: routeOf(file) }))
  .filter(({ route }) => /^\/api\/(admin|landlord|partner)\//.test(route));

const anyParams = () =>
  ({ params: Promise.resolve(new Proxy({}, { get: () => "00000000-0000-0000-0000-000000000000" })) }) as unknown as {
    params: Promise<Record<string, string>>;
  };

beforeEach(() => {
  process.env.APP_URL = "http://test.local";
});

describe("un locataire connecté est refusé sur l'administration et l'espace bailleur", () => {
  it("il y a bien des routes restreintes à tester", () => {
    expect(restricted.length).toBeGreaterThan(50);
  });

  for (const { file, route } of restricted) {
    it(route, async () => {
      const mod = await modules[file]();
      for (const method of METHODS.filter((m) => typeof mod[m] === "function")) {
        const handler = mod[method] as (r: Request, c: unknown) => Promise<Response>;
        const hasBody = method !== "GET" && method !== "DELETE";
        const res = await handler(
          new Request("http://test.local/api/x", {
            method,
            headers: { "Content-Type": "application/json" },
            body: hasBody ? "{}" : undefined,
          }),
          anyParams()
        );
        expect(res.status, `${method} ${route} → ${res.status}`).toBe(403);
      }
    });
  }
});
