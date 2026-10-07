import type { MetadataRoute } from "next";
import { absoluteUrl, ROBOTS_DISALLOWED_PATHS } from "@/lib/site";

// Reads APP_URL at request time, like the sitemap it points to.
export const dynamic = "force-dynamic";

/**
 * robots.txt (B-19). Private areas are excluded from crawling: the account
 * space, the back office, the API and the auth routes. This is not access
 * control (the server guards those routes) — only crawl hygiene. The legacy
 * /client and /partner prefixes only redirect into /app and are excluded too.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ROBOTS_DISALLOWED_PATHS }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
