import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

/**
 * PRD V1.1, R43 — the search type filter (SpaceTypeFilter, R5/R6's
 * "café / poste" auto-uncheck) scanned on its own: it is the one piece of
 * /search that is both new and interactive (Radix checkboxes wired to
 * client-side state reacting to the capacity field), so it gets a scoped
 * check in addition to the whole-page scan below.
 */
test("accessibilité — filtre de type d'espace (/search)", async ({ decidedVisitor: page }) => {
  await page.goto("/search");
  await page.waitForLoadState("networkidle");

  const fieldset = page.getByRole("group", { name: "Type d'espace" });
  await expect(fieldset).toBeVisible();

  const checkboxes = fieldset.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(3);
  for (const name of ["Café / poste", "Bureau", "Salles de réunion"]) {
    await expect(fieldset.getByRole("checkbox", { name })).toBeVisible();
  }

  // Keyboard-operable, not just mouse-clickable: Tab reaches each checkbox,
  // Space toggles it, and the visible/accessible state (aria-checked, since
  // Radix's Checkbox.Root is a <button role="checkbox">) agree.
  const cafeCheckbox = fieldset.getByRole("checkbox", { name: "Café / poste" });
  await cafeCheckbox.focus();
  await expect(cafeCheckbox).toBeFocused();
  const wasChecked = (await cafeCheckbox.getAttribute("aria-checked")) === "true";
  await page.keyboard.press("Space");
  await expect(cafeCheckbox).toHaveAttribute("aria-checked", String(!wasChecked));

  const results = await new AxeBuilder({ page })
    .include("fieldset")
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
