import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Garde d'accès de TOUTES les routes d'API, sans exception.
 *
 * On découvre automatiquement chaque `route.ts` sous src/app/api, on simule
 * un visiteur ANONYME (aucune session) et on appelle chaque méthode HTTP
 * exportée. Une route privée doit répondre 401/403 AVANT de toucher la base.
 * Si une nouvelle route privée est ajoutée sans garde, ce test casse tout
 * seul : il n'y a pas de liste à tenir à jour, sauf pour les routes
 * volontairement publiques ci-dessous.
 */

vi.mock("@/server/auth/rbac", async () => {
  const errors = await import("@/server/lib/errors");
  const reject = async () => {
    throw new errors.UnauthorizedError();
  };
  return {
    getAuthContext: async () => null,
    requireAuth: reject,
    requireAdmin: reject,
    requireRole: reject,
    requireOrg: reject,
    requireCapability: reject,
    requireOrganizationAccess: reject,
  };
});

// La base ne doit JAMAIS être atteinte par un visiteur anonyme sur une route privée.
vi.mock("@/server/db/prisma", () => {
  const boom = () => {
    throw new Error("DB_TOUCHED_BY_ANONYMOUS");
  };
  const handler: ProxyHandler<object> = {
    get: () => new Proxy(boom, handler),
    apply: boom,
  };
  return { prisma: new Proxy(boom, handler) };
});

vi.mock("@/server/auth/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

/** Routes publiques VOLONTAIRES : sans session, par conception. */
const PUBLIC_ROUTES: Record<string, string> = {
  "/api/health": "sonde de santé",
  "/api/health/live": "sonde de vivacité",
  "/api/health/ready": "sonde de disponibilité",
  "/api/spaces": "recherche publique d'espaces",
  "/api/spaces/[slug]/availability": "disponibilités publiques d'une fiche",
  "/api/spaces/[slug]/report": "signalement sans compte (limité par IP)",
  "/api/support/tickets": "formulaire de contact public (limité par IP)",
  "/api/auth/login": "connexion",
  "/api/auth/register": "inscription",
  "/api/auth/register-wizard": "inscription guidée",
  "/api/auth/password/forgot": "mot de passe oublié",
  "/api/webhooks/stripe": "webhook à signature vérifiée",
  "/api/internal/expire-bookings": "tâche planifiée (secret CRON)",
  "/api/internal/expire-promotions": "tâche planifiée (secret CRON)",
};

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const modules = import.meta.glob("/src/app/api/**/route.ts") as Record<
  string,
  () => Promise<Record<string, unknown>>
>;

function routeOf(file: string): string {
  return file.replace("/src/app", "").replace(/\/route\.ts$/, "");
}

const allRoutes = Object.keys(modules).map((file) => ({ file, route: routeOf(file) }));
const privateRoutes = allRoutes.filter((r) => !(r.route in PUBLIC_ROUTES));

const anyParams = () =>
  ({
    params: Promise.resolve(new Proxy({}, { get: () => "00000000-0000-0000-0000-000000000000" })),
  }) as unknown as { params: Promise<Record<string, string>> };

function makeRequest(method: string) {
  const hasBody = method !== "GET" && method !== "DELETE";
  return new Request("http://test.local/api/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: hasBody ? "{}" : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = "http://test.local";
});

describe("découverte des routes", () => {
  it("trouve bien les routes d'API (garde-fou contre un glob cassé)", () => {
    expect(allRoutes.length).toBeGreaterThan(100);
  });

  it("chaque route publique déclarée existe encore (liste à jour)", () => {
    const existing = new Set(allRoutes.map((r) => r.route));
    const stale = Object.keys(PUBLIC_ROUTES).filter((r) => !existing.has(r));
    expect(stale).toEqual([]);
  });
});

describe("un visiteur anonyme est refusé sur toute route privée", () => {
  for (const { file, route } of privateRoutes) {
    it(`${route}`, async () => {
      const mod = await modules[file]();
      const exported = METHODS.filter((m) => typeof mod[m] === "function");
      expect(exported.length, `${route} n'exporte aucune méthode HTTP`).toBeGreaterThan(0);

      for (const method of exported) {
        const handler = mod[method] as (r: Request, c: unknown) => Promise<Response>;
        const res = await handler(makeRequest(method), anyParams());
        expect(
          [401, 403],
          `${method} ${route} a répondu ${res.status} à un anonyme (attendu 401/403)`
        ).toContain(res.status);
      }
    });
  }
});

describe("les refus restent dans l'enveloppe d'erreur standard", () => {
  for (const { file, route } of privateRoutes) {
    it(`${route}`, async () => {
      const mod = await modules[file]();
      for (const method of METHODS.filter((m) => typeof mod[m] === "function")) {
        const handler = mod[method] as (r: Request, c: unknown) => Promise<Response>;
        const res = await handler(makeRequest(method), anyParams());
        const text = await res.text();
        expect(text).not.toMatch(/DB_TOUCHED_BY_ANONYMOUS|at .*\.ts:\d+|node_modules/);
        const body = JSON.parse(text) as { error?: { code?: string; message?: string } };
        expect(body.error?.code).toBeTruthy();
        expect(body.error?.message).toBeTruthy();
      }
    });
  }
});

describe("conventions de code des routes (analyse du source)", () => {
  const sources = allRoutes.map(({ file, route }) => ({
    route,
    source: readFileSync(path.join(process.cwd(), file.replace(/^\//, "")), "utf8"),
  }));

  it("toute route (hors sondes de santé) est enveloppée par withErrorHandling", () => {
    const missing = sources
      .filter(({ route }) => !route.startsWith("/api/health"))
      .filter(({ source }) => !source.includes("withErrorHandling"))
      .map(({ route }) => route);
    expect(missing).toEqual([]);
  });

  it("aucune route n'utilise la clé service role directement (passe par les domaines)", () => {
    const offenders = sources
      .filter(({ source }) => /SUPABASE_SERVICE_ROLE_KEY/.test(source))
      .map(({ route }) => route);
    expect(offenders).toEqual([]);
  });

  it("aucune route ne lit un montant ou une commission dans le corps de la requête", () => {
    const offenders = sources
      .filter(({ source }) => /body\.(priceCents|amountCents|commissionCents|totalCents)/.test(source))
      .map(({ route }) => route);
    expect(offenders).toEqual([]);
  });

  it("aucune route n'importe Stripe directement (tout passe par PaymentProvider)", () => {
    const offenders = sources
      .filter(({ route }) => route !== "/api/webhooks/stripe")
      .filter(({ source }) => /from\s+["']stripe["']/.test(source))
      .map(({ route }) => route);
    expect(offenders).toEqual([]);
  });

  it("aucune route ne fait console.log (utiliser le logger structuré)", () => {
    const offenders = sources
      .filter(({ source }) => /console\.(log|debug)\(/.test(source))
      .map(({ route }) => route);
    expect(offenders).toEqual([]);
  });
});
