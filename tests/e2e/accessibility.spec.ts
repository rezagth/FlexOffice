import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

/**
 * PRD V1.1, R43 — the search type filter (SpaceTypeFilter) scanned on its
 * own: it is the one interactive piece of /search new in this lot — the
 * capacity field only appears once a type is chosen, and raising capacity to
 * 6+ on "Bureau" switches the type to "Salle de réunion" with a visible,
 * reversible notice (R3-R6) — so it gets a scoped check in addition to the
 * whole-page scan below.
 */
test("accessibilité — filtre de type d'espace (/search)", async ({ decidedVisitor: page }) => {
  await page.goto("/search");
  await page.waitForLoadState("networkidle");

  const typeSelect = page.getByLabel("Type d'espace");
  await expect(typeSelect).toBeVisible();
  // Keyboard-operable: a native <select> is focusable and reachable by Tab.
  await typeSelect.focus();
  await expect(typeSelect).toBeFocused();

  const capacityField = page.getByLabel("Capacité minimale");
  await expect(capacityField).toHaveCount(0);

  await typeSelect.selectOption("DESK");
  await expect(capacityField).toBeVisible();

  await typeSelect.selectOption("");
  await expect(capacityField).toHaveCount(0);

  // The auto-switch: Bureau + 6 people becomes Salle de réunion, announced
  // (role="status") and reversible without the dropdown fighting the user.
  const filtersForm = page.getByRole("search", { name: "Filtres de recherche" });
  await typeSelect.selectOption("DESK");
  await capacityField.fill("6");
  await expect(typeSelect).toHaveValue("MEETING_ROOM");
  const notice = filtersForm.getByRole("status").filter({ hasText: "Salle de réunion" });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Revenir à Bureau" }).click();
  await expect(typeSelect).toHaveValue("DESK");

  // "Salle de formation" is never auto-switched, whatever the capacity.
  await typeSelect.selectOption("TRAINING_ROOM");
  await capacityField.fill("50");
  await expect(typeSelect).toHaveValue("TRAINING_ROOM");
  await expect(filtersForm.getByRole("status").filter({ hasText: "Salle de réunion" })).toHaveCount(0);

  const results = await new AxeBuilder({ page })
    .include('[aria-label="Filtres de recherche"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)
  ).toEqual([]);
});

/** Serious and critical WCAG 2.1 A/AA violations fail the build; minor ones
 * are left to the regular design review. */
for (const path of [
  "/",
  "/search",
  "/login",
  "/register",
  "/proposer-un-espace",
  "/contact",
  "/comment-ca-marche",
  "/faq",
  "/a-propos",
  "/spaces/salle-rivoli-paris",
]) {
  test(`accessibilité ${path}`, async ({ decidedVisitor: page }) => {
    await page.goto(path);
    // Result cards fade in (opacity 0 → 1, ≤ 0.6 s): measuring contrast
    // mid-animation reports text that is fine once settled.
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    await page.waitForTimeout(700);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`),
    ).toEqual([]);
  });
}
