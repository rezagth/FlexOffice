import { afterEach, describe, expect, it, vi } from "vitest";

const listPublishedSpaceSlugs = vi.fn();
vi.mock("@/server/domains/spaces/list-spaces", () => ({ listPublishedSpaceSlugs }));
vi.mock("@/server/lib/logger", () => ({ logError: vi.fn() }));

const { absoluteUrl, getSiteUrl, pageMetadata } = await import("@/lib/site");
const { jsonLd } = await import("@/lib/json-ld");
const sitemap = (await import("@/app/sitemap")).default;
const robots = (await import("@/app/robots")).default;

afterEach(() => {
  vi.unstubAllEnvs();
  listPublishedSpaceSlugs.mockReset();
});

describe("getSiteUrl", () => {
  it("uses APP_URL without its trailing slash", () => {
    vi.stubEnv("APP_URL", "https://www.example.fr/");
    expect(getSiteUrl()).toBe("https://www.example.fr");
    expect(absoluteUrl("/search")).toBe("https://www.example.fr/search");
  });

  it("falls back to localhost when APP_URL is missing, empty or not http(s)", () => {
    vi.stubEnv("APP_URL", "");
    expect(getSiteUrl()).toBe("http://localhost:3000");
    vi.stubEnv("APP_URL", "javascript:alert(1)");
    expect(getSiteUrl()).toBe("http://localhost:3000");
    vi.stubEnv("APP_URL", "not a url");
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });
});

describe("pageMetadata", () => {
  it("sets the canonical URL and an OpenGraph/Twitter block matching the page", () => {
    const metadata = pageMetadata({ title: "T", description: "D", path: "/search" });
    expect(metadata.alternates?.canonical).toBe("/search");
    expect(metadata.openGraph).toMatchObject({ title: "T", description: "D", url: "/search" });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: "T" });
    expect(metadata.robots).toBeUndefined();
  });

  it("can mark a page noindex", () => {
    expect(pageMetadata({ title: "T", description: "D", path: "/x", noIndex: true }).robots).toEqual({
      index: false,
      follow: false,
    });
  });
});

describe("jsonLd", () => {
  it("cannot be used to close the script tag", () => {
    const out = jsonLd({ description: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).description).toBe("</script><script>alert(1)</script>");
  });
});

describe("sitemap.xml", () => {
  it("lists the public pages and every published space under APP_URL", async () => {
    vi.stubEnv("APP_URL", "https://www.example.fr");
    listPublishedSpaceSlugs.mockResolvedValue([
      { slug: "salle-a", updatedAt: new Date("2026-10-01T00:00:00Z") },
      { slug: "salle-b" },
    ]);
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://www.example.fr/");
    expect(urls).toContain("https://www.example.fr/search");
    expect(urls).toContain("https://www.example.fr/cgv");
    expect(urls).toContain("https://www.example.fr/spaces/salle-a");
    expect(urls).toContain("https://www.example.fr/spaces/salle-b");
    expect(urls.some((url) => url.includes("/app") || url.includes("/admin"))).toBe(false);
  });

  it("still serves the static pages when the database is unavailable", async () => {
    listPublishedSpaceSlugs.mockRejectedValue(new Error("db down"));
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("http://localhost:3000/search");
  });
});

describe("robots.txt", () => {
  it("excludes the private areas and points to the sitemap", () => {
    vi.stubEnv("APP_URL", "https://www.example.fr");
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule.disallow).toEqual(expect.arrayContaining(["/app", "/admin", "/api", "/auth"]));
    expect(result.sitemap).toBe("https://www.example.fr/sitemap.xml");
  });
});
