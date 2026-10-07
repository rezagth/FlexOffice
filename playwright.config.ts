import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests of the public journeys, run against the production build
 * in demo mode (OFFICEFLEX_DEMO_MODE=true, no database, no Supabase, no
 * Stripe). They check what a visitor actually gets — pages, links, forms,
 * consent, redirects — not the money paths, which the integration suite
 * covers against a real database.
 *
 * Files are named *.spec.ts so Vitest (tests/**\/*.test.ts) ignores them.
 *
 * `pnpm build` must have run first. PLAYWRIGHT_CHROMIUM_PATH points at a
 * preinstalled Chromium when `playwright install` is not available.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], launchOptions: { executablePath } },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm start",
        url: `${baseURL}/api/health/live`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          PORT: String(PORT),
          OFFICEFLEX_DEMO_MODE: "true",
          NEXT_TELEMETRY_DISABLED: "1",
        },
      },
});
