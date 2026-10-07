import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";

/** Serious and critical WCAG 2.1 A/AA violations fail the build; minor ones
 * are left to the regular design review. */
for (const path of ["/", "/search", "/login", "/register", "/proposer-un-espace", "/contact"]) {
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
