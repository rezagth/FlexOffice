import { test, expect } from "@playwright/test";

/**
 * The e2e build has no NEXT_PUBLIC_POSTHOG_KEY (demo contract: build with no
 * variables). Without PostHog nothing needs prior consent, so the banner is
 * not imposed — but the visitor can still open the panel and object to the
 * cookieless audience measurement (CNIL: withdrawing as easy as giving).
 * The "banner first" behaviour with PostHog is covered by the component tests.
 */
test.describe("consentement cookies", () => {
  test("sans PostHog : pas de bandeau imposé, le pied de page ouvre le panneau et le choix est retenu", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.locator("footer").getByRole("button", { name: "Gérer les cookies" }).click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Tout refuser" }).click();
    await expect(panel).toBeHidden();

    const stored = await page.evaluate(() => window.localStorage.getItem("officeflex.consent"));
    expect(JSON.parse(stored!)).toMatchObject({ version: 1, audience: false, analytics: false });

    await page.reload();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("la page cookies propose aussi de modifier ses choix", async ({ page }) => {
    await page.goto("/cookies");
    await page.getByRole("main").getByRole("button", { name: /cookies|choix|préférences/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("aucune requête d'analyse produit sans consentement", async ({ page }) => {
    const analytics: string[] = [];
    page.on("request", (r) => {
      if (/posthog/.test(r.url())) analytics.push(r.url());
    });
    await page.goto("/");
    await page.goto("/search");
    expect(analytics).toEqual([]);
  });
});
