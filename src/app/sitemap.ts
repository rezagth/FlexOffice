import type { MetadataRoute } from "next";
import { listPublishedSpaceSlugs } from "@/server/domains/spaces/list-spaces";
import { logError } from "@/server/lib/logger";
import { absoluteUrl, STATIC_SITEMAP_PATHS } from "@/lib/site";

// Listings change continuously: built per request, never frozen at build
// time (a build in demo mode would otherwise ship the mock slugs).
export const dynamic = "force-dynamic";


/**
 * sitemap.xml (B-19): the public pages plus every published space, with the
 * same visibility rule as the public search (listPublishedSpaceSlugs).
 * Base URL from APP_URL (http://localhost:3000 when unset).
 *
 * If the database cannot be read, the static pages are still served — a
 * crawler gets a partial sitemap rather than a 500.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_SITEMAP_PATHS.map((page) => ({
    url: absoluteUrl(page.path),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  try {
    const spaces = await listPublishedSpaceSlugs();
    for (const space of spaces) {
      entries.push({
        url: absoluteUrl(`/spaces/${space.slug}`),
        ...(space.updatedAt ? { lastModified: space.updatedAt } : {}),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  } catch (error) {
    logError({ event: "sitemap.spaces_unavailable", error });
  }

  return entries;
}
