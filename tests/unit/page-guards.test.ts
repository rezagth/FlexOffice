import { beforeEach, describe, expect, it, vi } from "vitest";

class RedirectSignal extends Error {
  constructor(public readonly url: string) {
    super(`REDIRECT:${url}`);
  }
}
const redirect = vi.fn((url: string) => {
  throw new RedirectSignal(url);
});
const headersGet = vi.fn();
const getAuthContext = vi.fn();
const logEvent = vi.fn();

vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (e: unknown) => {
    if (e instanceof RedirectSignal) throw e;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGet }) }));
vi.mock("@/proxy", () => ({ PATHNAME_HEADER: "x-makom-pathname" }));
vi.mock("@/server/auth/rbac", () => ({ getAuthContext }));
vi.mock("@/server/lib/logger", () => ({ logEvent, logError: vi.fn() }));

const guards = await import("@/server/auth/page-guards");

const ctx = (over: Record<string, unknown> = {}) => ({
  userId: "u1",
  platformRole: "USER",
  role: "CLIENT",
  isLandlord: true,
  activeMode: "LANDLORD",
  activeOrgId: "org-1",
  activeOrgRole: "OWNER",
  capabilities: new Set(["landlord:view_dashboard", "landlord:manage_spaces"]),
  ...over,
});

async function redirected(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof RedirectSignal) return e.url;
    throw e;
  }
  throw new Error("aucune redirection");
}

beforeEach(() => {
  vi.clearAllMocks();
  headersGet.mockReturnValue(null);
});

describe("requirePageAuth", () => {
  it("renvoie le contexte d'un utilisateur connecté", async () => {
    getAuthContext.mockResolvedValue(ctx());
    await expect(guards.requirePageAuth()).resolves.toMatchObject({ userId: "u1" });
  });

  it("anonyme → /login avec retour vers /app par défaut", async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await redirected(guards.requirePageAuth())).toBe("/login?redirectTo=%2Fapp");
  });

  it("anonyme → retour vers la page demandée (en-tête posé par le proxy)", async () => {
    getAuthContext.mockResolvedValue(null);
    headersGet.mockReturnValue("/app/bookings");
    expect(await redirected(guards.requirePageAuth())).toBe("/login?redirectTo=%2Fapp%2Fbookings");
  });

  it("un en-tête de chemin hostile ne devient jamais une redirection ouverte", async () => {
    getAuthContext.mockResolvedValue(null);
    for (const evil of ["https://evil.example/phish", "//evil.example", "javascript:alert(1)"]) {
      headersGet.mockReturnValue(evil);
      const url = await redirected(guards.requirePageAuth());
      expect(url).toBe("/login?redirectTo=%2Fapp");
    }
  });

  it("redirectTo explicite prioritaire", async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await redirected(guards.requirePageAuth({ redirectTo: "/admin/dashboard" }))).toBe(
      "/login?redirectTo=%2Fadmin%2Fdashboard"
    );
  });
});

describe("requirePageCapability", () => {
  it("laisse passer quand la capacité est détenue", async () => {
    getAuthContext.mockResolvedValue(ctx());
    await expect(guards.requirePageCapability("landlord:manage_spaces")).resolves.toBeDefined();
  });

  it("capacité absente → redirection vers l'accueil de l'utilisateur + journal", async () => {
    getAuthContext.mockResolvedValue(ctx());
    expect(await redirected(guards.requirePageCapability("admin:access_backoffice"))).toBe("/app");
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "authz.page_capability_denied", required_capability: "admin:access_backoffice" })
    );
  });

  it("un administrateur sans la capacité est renvoyé vers le back-office", async () => {
    getAuthContext.mockResolvedValue(ctx({ platformRole: "ADMIN", capabilities: new Set() }));
    expect(await redirected(guards.requirePageCapability("landlord:manage_spaces"))).toBe("/admin/dashboard");
  });
});

describe("requirePageLandlordOrg", () => {
  it("non bailleur → parcours « devenir bailleur »", async () => {
    getAuthContext.mockResolvedValue(ctx({ isLandlord: false }));
    expect(await redirected(guards.requirePageLandlordOrg())).toBe("/app/become-landlord");
  });

  it("bailleur sans organisation active → accueil", async () => {
    getAuthContext.mockResolvedValue(ctx({ activeOrgId: null }));
    expect(await redirected(guards.requirePageLandlordOrg())).toBe("/app");
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ reason: "no_active_organization" }));
  });

  it("membre sans la capacité demandée → accueil + raison journalisée", async () => {
    getAuthContext.mockResolvedValue(ctx({ capabilities: new Set(["landlord:view_dashboard"]) }));
    expect(await redirected(guards.requirePageLandlordOrg("landlord:manage_spaces"))).toBe("/app");
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ reason: "capability_missing" }));
  });

  it("cas nominal : renvoie le contexte avec l'organisation de la session", async () => {
    getAuthContext.mockResolvedValue(ctx());
    await expect(guards.requirePageLandlordOrg()).resolves.toMatchObject({ activeOrgId: "org-1" });
  });
});

describe("requirePageAdmin", () => {
  it("refuse un non-administrateur", async () => {
    getAuthContext.mockResolvedValue(ctx());
    expect(await redirected(guards.requirePageAdmin())).toBe("/app");
  });

  it("accepte l'administrateur avec la capacité du back-office", async () => {
    getAuthContext.mockResolvedValue(
      ctx({ platformRole: "ADMIN", capabilities: new Set(["admin:access_backoffice"]) })
    );
    await expect(guards.requirePageAdmin()).resolves.toBeDefined();
  });

  it("anonyme → connexion puis retour vers le tableau de bord admin", async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await redirected(guards.requirePageAdmin())).toBe("/login?redirectTo=%2Fadmin%2Fdashboard");
  });
});

describe("requirePageRole (héritage)", () => {
  it("anonyme → connexion", async () => {
    getAuthContext.mockResolvedValue(null);
    expect(await redirected(guards.requirePageRole("ADMIN"))).toBe("/login?redirectTo=%2Fadmin%2Fdashboard");
  });

  it("mauvais rôle → redirection + journal", async () => {
    getAuthContext.mockResolvedValue(ctx({ role: "CLIENT" }));
    expect(await redirected(guards.requirePageRole("ADMIN"))).toBe("/app");
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "authz.page_role_mismatch" }));
  });

  it("bon rôle → contexte", async () => {
    getAuthContext.mockResolvedValue(ctx({ role: "ADMIN", platformRole: "ADMIN" }));
    await expect(guards.requirePageRole("ADMIN")).resolves.toBeDefined();
  });
});
