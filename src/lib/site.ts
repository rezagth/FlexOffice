/**
 * Public identity of the site, shared by metadata, sitemap, robots and
 * structured data. Isomorphic, no secrets.
 *
 * The brand name is written literally on purpose: the OfficeFlex →
 * MakomSpace rename is done in one pass across the repository later.
 */
export const SITE_NAME = "OfficeFlex";

export const SITE_DESCRIPTION =
  "OfficeFlex connecte les entreprises qui ont des espaces sous-utilisés aux professionnels qui cherchent une salle de réunion, un bureau ou un espace de formation à la demi-journée ou à la journée.";

/** Static 1200×630 image in public/ — deliberately not generated with
 * next/og (see the lot B report). */
export const DEFAULT_OG_IMAGE = {
  url: "/og-default.png",
  width: 1200,
  height: 630,
  alt: "OfficeFlex — espaces professionnels à la demande",
};

const FALLBACK_SITE_URL = "http://localhost:3000";

/**
 * Absolute base URL of the public site: APP_URL when it is a valid http(s)
 * URL, http://localhost:3000 otherwise (demo mode, local development).
 * Never throws — a missing APP_URL must not take a page down (demo contract).
 * Returned without a trailing slash.
 */
export function getSiteUrl(): string {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return FALLBACK_SITE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return FALLBACK_SITE_URL;
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return FALLBACK_SITE_URL;
  }
}

/** Absolute URL for a site path ("/spaces/x" → "https://…/spaces/x"). */
export function absoluteUrl(path: string): string {
  return `${getSiteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
