import { test, expect } from "./fixtures";

test.describe("parcours publics (mode démo)", () => {
  test("accueil : marque, titre et recherche par ville", async ({ decidedVisitor: page, isMobile }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/MakomSpace/);
    await expect(page.getByRole("link", { name: /MakomSpace — accueil/ }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const search = page.getByRole("search", { name: "Rechercher un espace" });
    await search.getByPlaceholder(/Ville/).fill("Lyon");
    await search.getByRole("button", { name: /Rechercher/ }).click();
    await expect(page).toHaveURL(/\/search\?.*city=Lyon/);
    await expect(page.locator('a[href^="/spaces/"]').first()).toBeVisible();
    test.info().annotations.push({ type: "viewport", description: isMobile ? "mobile" : "desktop" });
  });

  test("recherche → fiche d'un espace → réserver demande la connexion", async ({ decidedVisitor: page }) => {
    await page.goto("/search");
    const first = page.locator('a[href^="/spaces/"]').first();
    await expect(first).toBeVisible();
    const href = await first.getAttribute("href");
    expect(href).toBeTruthy();

    await page.goto(href!);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).toHaveTitle(/MakomSpace/);

    // Booking is behind sign-in: an anonymous visitor lands on /login with
    // a same-site redirectTo, never on a broken page.
    await page.goto(`${href}/booking`);
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fspaces%2F/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("l'espace connecté redirige vers la connexion", async ({ decidedVisitor: page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp/);
  });

  test("inscription : validation côté client et acceptation des CGU", async ({ decidedVisitor: page }) => {
    await page.goto("/register");
    await expect(page).toHaveTitle(/Inscription/);
    await page.getByRole("button", { name: /Créer|inscri/i }).click();
    // Empty form: errors are announced on the fields, nothing is sent.
    await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
    await expect(page.getByLabel(/CGU|conditions/i).first()).toBeVisible();
  });

  test("pages légales et liens du pied de page", async ({ decidedVisitor: page }) => {
    for (const [path, title] of [
      ["/mentions-legales", /Mentions légales/],
      ["/cgu", /CGU|Conditions générales d'utilisation/],
      ["/cgv", /CGV|Conditions générales de vente/],
      ["/confidentialite", /confidentialité/i],
      ["/cookies", /cookies/i],
      ["/contact", /contacter/i],
      ["/proposer-un-espace", /Proposer un espace/],
    ] as const) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page).toHaveTitle(title);
    }
    await page.goto("/");
    const footer = page.locator("footer");
    await footer.getByRole("link", { name: "CGV" }).click();
    await expect(page).toHaveURL(/\/cgv$/);
  });

  test("page introuvable : 404 avec un chemin de retour", async ({ decidedVisitor: page }) => {
    const res = await page.goto("/cette-page-n-existe-pas");
    expect(res?.status()).toBe(404);
    await expect(page).toHaveTitle(/introuvable/i);
    await expect(page.getByRole("link", { name: /accueil|rechercher/i }).first()).toBeVisible();
  });
});
