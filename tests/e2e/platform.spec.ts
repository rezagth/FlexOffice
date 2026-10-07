import { test, expect } from "@playwright/test";

test.describe("plateforme", () => {
  test("sonde de vivacité et en-têtes de sécurité", async ({ request }) => {
    const res = await request.get("/api/health/live");
    expect(res.status()).toBe(200);

    const home = await request.get("/");
    const headers = home.headers();
    expect(headers["x-request-id"]).toBeTruthy();
    expect(headers["content-security-policy"] ?? headers["content-security-policy-report-only"]).toContain(
      "default-src",
    );
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("robots.txt, sitemap et manifeste", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /app");
    expect(robots).toContain("Disallow: /admin");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("/search");

    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.short_name).toBe("MakomSpace");
  });

  test("les routes d'API privées refusent un visiteur anonyme", async ({ request }) => {
    const res = await request.get("/api/client/gdpr/export");
    expect([401, 403, 503]).toContain(res.status());
  });
});
