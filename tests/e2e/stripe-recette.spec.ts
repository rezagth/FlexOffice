import { test, expect, type Page } from "@playwright/test";

/**
 * C6 — payment journey in STRIPE TEST MODE (R1-R4 of docs/runbooks/recette-stripe.md).
 *
 * NOT part of the normal e2e run (which targets the demo-mode build): it runs
 * only when E2E_STRIPE_RECETTE=1, against a deployment built with
 *   PAYMENT_PROVIDER=stripe, STRIPE_SECRET_KEY=sk_test_…, the publishable test
 * key and a webhook reaching that deployment (Stripe CLI `stripe listen`, or
 * the test-mode endpoint of the Stripe dashboard).
 *
 * Required environment — nothing is hard-coded, nothing secret is committed:
 *   E2E_BASE_URL            the recette deployment
 *   E2E_SPACE_SLUG          a published space whose landlord finished Stripe
 *                           Connect onboarding in test mode (runbook step 0)
 *   E2E_TENANT_EMAIL / E2E_TENANT_PASSWORD     a client account
 *   E2E_LANDLORD_EMAIL / E2E_LANDLORD_PASSWORD the space owner's account
 *
 * Stripe's published TEST cards: 4242… succeeds, 4000 0025 0000 3155 asks for
 * 3-D Secure, 4000 0000 0000 0002 is declined.
 */
const enabled = process.env.E2E_STRIPE_RECETTE === "1";
test.skip(!enabled, "Stripe recette: set E2E_STRIPE_RECETTE=1 (see docs/runbooks/recette-stripe.md)");
test.describe.configure({ mode: "serial" });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the Stripe recette`);
  return value;
}

function futureDate(daysAhead: number): string {
  const date = new Date(Date.now() + daysAhead * 86_400_000);
  return date.toISOString().slice(0, 10);
}

async function dismissConsent(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "officeflex.consent",
      JSON.stringify({ version: 1, audience: false, analytics: false, decidedAt: new Date().toISOString() }),
    );
  });
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/app/);
}

/** Fills the Stripe PaymentElement (an isolated iframe) with a test card. */
async function fillCard(page: Page, cardNumber: string) {
  const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
  await frame.getByLabel(/numéro de carte|card number/i).fill(cardNumber);
  await frame.getByLabel(/expiration|expiry/i).fill("12 / 34");
  await frame.getByLabel(/cvc|code de sécurité/i).fill("123");
  const postal = frame.getByLabel(/code postal|postal code|zip/i);
  if (await postal.count()) await postal.first().fill("75001");
}

/** Walks the funnel up to the card step. */
async function startBooking(page: Page, date: string) {
  await page.goto(`/spaces/${requireEnv("E2E_SPACE_SLUG")}/booking?date=${date}`);
  await page.locator('input[role="radio"]:not([disabled]), button[role="radio"]:not([disabled])').first().click();
  await page.getByLabel("Nombre de participants").fill("2");
  await page.getByLabel("Motif de la réservation").fill("Recette Stripe (test)");
  await page.getByLabel(/J.accepte les/).check();
  await page.getByRole("button", { name: "Envoyer la demande" }).click();
  await expect(page.getByRole("heading", { name: /Paiement/ })).toBeVisible({ timeout: 30_000 });
}

test.describe("paiement en mode test Stripe", () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test("R1 — carte 4242 : autorisée, demande envoyée, rien n'est débité avant acceptation", async ({ page }) => {
    await login(page, requireEnv("E2E_TENANT_EMAIL"), requireEnv("E2E_TENANT_PASSWORD"));
    await startBooking(page, futureDate(30));
    await fillCard(page, "4242 4242 4242 4242");
    await page.getByRole("button", { name: "Autoriser le paiement" }).click();

    // finish() sends the client to its bookings; the webhook turns the hold
    // into a request (PENDING) — never the browser.
    await expect(page).toHaveURL(/\/app\/bookings/, { timeout: 60_000 });
    await expect(page.getByText(/en attente/i).first()).toBeVisible({ timeout: 60_000 });
  });

  test("R3 — carte refusée : message d'erreur, aucune demande créée", async ({ page }) => {
    await login(page, requireEnv("E2E_TENANT_EMAIL"), requireEnv("E2E_TENANT_PASSWORD"));
    await startBooking(page, futureDate(31));
    await fillCard(page, "4000 0000 0000 0002");
    await page.getByRole("button", { name: "Autoriser le paiement" }).click();

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/app\/bookings/);
  });

  test("R2 — carte 3-D Secure : le défi s'affiche puis la demande est envoyée", async ({ page }) => {
    await login(page, requireEnv("E2E_TENANT_EMAIL"), requireEnv("E2E_TENANT_PASSWORD"));
    await startBooking(page, futureDate(32));
    await fillCard(page, "4000 0025 0000 3155");
    await page.getByRole("button", { name: "Autoriser le paiement" }).click();

    // Stripe's test 3DS challenge lives in nested iframes.
    const challenge = page
      .frameLocator('iframe[name^="__privateStripeFrame"][src*="three-ds"], iframe[src*="3d_secure"]')
      .first()
      .frameLocator("iframe")
      .first();
    await challenge.getByRole("button", { name: /complete|authenticate|valider/i }).click({ timeout: 30_000 });

    await expect(page).toHaveURL(/\/app\/bookings/, { timeout: 60_000 });
  });

  test("R4 — le bailleur accepte : le paiement est capturé (vérifier la facture et Stripe)", async ({ page }) => {
    await login(page, requireEnv("E2E_LANDLORD_EMAIL"), requireEnv("E2E_LANDLORD_PASSWORD"));
    await page.goto("/app/landlord/requests");
    await page.getByRole("button", { name: "Accepter" }).first().click();
    await expect(page.getByText(/confirm/i).first()).toBeVisible({ timeout: 60_000 });
    // The capture itself is confirmed by payment_intent.succeeded through the
    // webhook: check the PaymentIntent "Succeeded" in the Stripe dashboard and
    // the invoice number on the booking (runbook R4).
  });
});
