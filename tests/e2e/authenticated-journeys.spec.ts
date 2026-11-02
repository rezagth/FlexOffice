import { test, expect, type Page } from "@playwright/test";

/**
 * Parcours CONNECTÉS : locataire, bailleur, administrateur.
 *
 * Ces tests ont besoin de vrais comptes (base + Supabase configurés) et se
 * mettent en pause tant que les variables ne sont pas fournies :
 *
 *   E2E_BASE_URL=https://… (ou serveur local en mode non-démo)
 *   E2E_TENANT_EMAIL / E2E_TENANT_PASSWORD     (locataire simple, non bailleur)
 *   E2E_LANDLORD_EMAIL / E2E_LANDLORD_PASSWORD (bailleur avec organisation)
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD       (administrateur plateforme)
 *
 * Aucun mot de passe n'est écrit dans le dépôt.
 */

type Account = { email: string; password: string };
const account = (prefix: string): Account | null => {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  return email && password ? { email, password } : null;
};
const tenant = account("E2E_TENANT");
const landlord = account("E2E_LANDLORD");
const admin = account("E2E_ADMIN");

async function decideCookies(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "officeflex.consent",
      JSON.stringify({ version: 1, audience: false, analytics: false, decidedAt: new Date().toISOString() })
    );
  });
}

async function login(page: Page, who: Account) {
  await decideCookies(page);
  await page.goto("/login");
  await page.getByTestId("login-email").fill(who.email);
  await page.getByTestId("login-password").fill(who.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

/** Une page qui s'affiche vraiment : pas d'erreur serveur, pas de page blanche. */
async function expectHealthyPage(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `${path} → statut HTTP`).toBeLessThan(400);
  await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error|Unhandled Runtime Error/i);
  await expect(page.locator("main, [role=main], body")).toBeVisible();
  const text = (await page.locator("body").innerText()).trim();
  expect(text.length, `${path} est vide`).toBeGreaterThan(20);
}

test.describe("connexion", () => {
  test("un mauvais mot de passe affiche une erreur et reste sur /login @smoke", async ({ page }) => {
    await decideCookies(page);
    await page.goto("/login");
    await page.getByTestId("login-email").fill("inconnu@test.invalid");
    await page.getByTestId("login-password").fill("MauvaisMotDePasse!123");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("login-error")).toBeVisible();
  });

  test("le message d'erreur ne révèle pas si le compte existe", async ({ page }) => {
    await decideCookies(page);
    await page.goto("/login");
    await page.getByTestId("login-email").fill("inconnu@test.invalid");
    await page.getByTestId("login-password").fill("MauvaisMotDePasse!123");
    await page.getByTestId("login-submit").click();
    await expect(page.locator("body")).not.toContainText(/compte (introuvable|inexistant)|utilisateur inconnu/i);
  });

  test("un lien profond protégé ramène vers la page demandée après connexion", async ({ page }) => {
    test.skip(!tenant, "E2E_TENANT_* non fournis");
    await decideCookies(page);
    await page.goto("/app/bookings");
    await expect(page).toHaveURL(/\/login/);
    await page.getByTestId("login-email").fill(tenant!.email);
    await page.getByTestId("login-password").fill(tenant!.password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/app\/bookings/, { timeout: 20_000 });
  });

  test("un lien de redirection externe est ignoré", async ({ page }) => {
    test.skip(!tenant, "E2E_TENANT_* non fournis");
    await decideCookies(page);
    await page.goto("/login?redirectTo=https://evil.example/phish");
    await page.getByTestId("login-email").fill(tenant!.email);
    await page.getByTestId("login-password").fill(tenant!.password);
    await page.getByTestId("login-submit").click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
    expect(new URL(page.url()).hostname).not.toBe("evil.example");
  });
});

test.describe("locataire connecté", () => {
  test.skip(!tenant, "E2E_TENANT_* non fournis");

  test.beforeEach(async ({ page }) => login(page, tenant!));

  for (const path of [
    "/app",
    "/app/bookings",
    "/app/favorites",
    "/app/messages",
    "/app/notifications",
    "/app/invoices",
    "/app/account",
  ]) {
    test(`${path} s'affiche`, async ({ page }) => {
      await expectHealthyPage(page, path);
    });
  }

  test("l'administration est interdite : redirection, jamais le contenu", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).not.toHaveURL(/\/admin\/dashboard$/);
  });

  test("l'espace bailleur propose de devenir bailleur (compte non bailleur)", async ({ page }) => {
    await page.goto("/app/landlord/listings");
    await expect(page).toHaveURL(/(?:become-landlord|\/app$)/);
  });

  test("les API d'administration répondent 403", async ({ request }) => {
    // Le contexte `request` partage les cookies de la page après connexion.
    const res = await request.get("/api/admin/users");
    expect([401, 403]).toContain(res.status());
  });

  test("l'export RGPD ne contient ni mot de passe ni jeton", async ({ page }) => {
    const res = await page.request.get("/api/client/gdpr/export");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/password|encrypted_password|service_role|refresh_token/i);
  });

  test("se déconnecter ferme la session", async ({ page }) => {
    await page.goto("/app");
    await page.getByRole("button", { name: /déconnexion|se déconnecter/i }).first().click();
    await page.goto("/app/bookings");
    await expect(page).toHaveURL(/\/login/);
  });

  test("la fiche d'un espace affiche le bouton de signalement", async ({ page }) => {
    await page.goto("/search");
    const first = page.locator("a[href^='/spaces/']").first();
    test.skip((await first.count()) === 0, "aucun espace publié");
    await first.click();
    await expect(page.getByRole("button", { name: /signaler/i })).toBeVisible();
  });
});

test.describe("bailleur connecté", () => {
  test.skip(!landlord, "E2E_LANDLORD_* non fournis");

  test.beforeEach(async ({ page }) => login(page, landlord!));

  for (const path of [
    "/app/landlord/listings",
    "/app/landlord/spaces",
    "/app/landlord/properties",
    "/app/landlord/properties/new",
    "/app/landlord/spaces/new",
    "/app/landlord/requests",
    "/app/landlord/calendar",
    "/app/landlord/revenue",
    "/app/landlord/payouts",
    "/app/landlord/accounting",
    "/app/landlord/promotions",
    "/app/landlord/promotions/new",
    "/app/landlord/reviews",
    "/app/landlord/verification",
  ]) {
    test(`${path} s'affiche`, async ({ page }) => {
      await expectHealthyPage(page, path);
    });
  }

  test("la page Versements propose le formulaire d'identité fiscale (DAC7)", async ({ page }) => {
    await page.goto("/app/landlord/payouts");
    await expect(page.getByText(/résidence fiscale/i).first()).toBeVisible();
  });

  test("le formulaire fiscal refuse un pays invalide", async ({ page }) => {
    await page.goto("/app/landlord/payouts");
    const country = page.getByLabel(/pays/i).first();
    await country.fill("FRANCE");
    await page.getByRole("button", { name: /enregistrer/i }).first().click();
    await expect(page.getByText(/2 lettres|invalide/i).first()).toBeVisible();
  });

  test("l'administration est interdite à un bailleur", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).not.toHaveURL(/\/admin\/dashboard$/);
  });
});

test.describe("administrateur connecté", () => {
  test.skip(!admin, "E2E_ADMIN_* non fournis");

  test.beforeEach(async ({ page }) => login(page, admin!));

  for (const path of [
    "/admin/dashboard",
    "/admin/review-queue",
    "/admin/listings",
    "/admin/verifications",
    "/admin/organizations",
    "/admin/users",
    "/admin/payments",
    "/admin/payouts",
    "/admin/invoices",
    "/admin/commission-statements",
    "/admin/disputes",
    "/admin/stripe-disputes",
    "/admin/promotions",
    "/admin/reviews",
    "/admin/support",
    "/admin/notifications",
    "/admin/domiciliations",
  ]) {
    test(`${path} s'affiche`, async ({ page }) => {
      await expectHealthyPage(page, path);
    });
  }

  test("l'export DAC7 est un CSV avec en-tête et BOM", async ({ page }) => {
    const res = await page.request.get("/api/admin/dac7-export?year=2026");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const body = await res.text();
    expect(body.startsWith("﻿")).toBe(true);
    expect(body).toContain("Pays de résidence fiscale");
  });

  test("l'export DAC7 refuse une année absurde", async ({ page }) => {
    const res = await page.request.get("/api/admin/dac7-export?year=abc");
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test("la file « À traiter » s'affiche avec ses compteurs", async ({ page }) => {
    await page.goto("/admin/review-queue");
    await expect(page.locator("body")).toContainText(/à traiter/i);
  });
});
