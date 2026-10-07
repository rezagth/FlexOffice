import { test as base, expect, type Page } from "@playwright/test";

/** A visitor who already answered the cookie banner ("Tout refuser"), so it
 * doesn't cover the page in journeys that are not about consent. */
export const test = base.extend<{ decidedVisitor: Page }>({
  decidedVisitor: async ({ page }, provide) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "officeflex.consent",
        JSON.stringify({ version: 1, audience: false, analytics: false, decidedAt: new Date().toISOString() }),
      );
    });
    await provide(page);
  },
});

export { expect };
