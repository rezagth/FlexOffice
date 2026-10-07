import type { Metadata } from "next";

/**
 * Public identity of the site, shared by metadata, sitemap, robots and
 * structured data. Isomorphic, no secrets.
 *
 * SITE_NAME is the single source of the brand name for code: metadata, e-mail
 * layout, invoice mentions and the logo read it. Long-form legal and
 * marketing copy writes the name literally, like any other prose.
 */
export const SITE_NAME = "MakomSpace";

export const SITE_TAGLINE = "L'espace qu'il vous faut, pour le temps qu'il vous faut.";

export const SITE_DESCRIPTION =
  "MakomSpace connecte les entreprises qui ont des espaces sous-utilisés aux professionnels qui cherchent une salle de réunion, un bureau ou un espace de formation à la demi-journée ou à la journée.";

/** Static 1200×630 image in public/ — deliberately not generated with
 * next/og (see the lot B report). */
export const DEFAULT_OG_IMAGE = {
  url: "/og-default.png",
  width: 1200,
  height: 630,
  alt: "MakomSpace — espaces professionnels à la demande",
};

/**
 * Metadata of a public page: title, description, canonical URL and matching
 * OpenGraph/Twitter fields. Next.js replaces (does not merge) the layout's
 * `openGraph` object when a page sets its own, so a page that only set a
 * title used to keep the home page's OpenGraph title — this sets both.
 */
export function pageMetadata({
  title,
  description,
  path,
  image,
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  image?: { url: string; width?: number; height?: number; alt?: string };
  noIndex?: boolean;
}): Metadata {
  const images = [image ?? DEFAULT_OG_IMAGE];
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "fr_FR",
      siteName: SITE_NAME,
      url: path,
      title,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.map((i) => i.url),
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}

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

/** Public pages that are always present. Contact and the legal pages are
 * public but rarely change. */
export const STATIC_SITEMAP_PATHS: {
  path: string;
  priority: number;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
}[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/search", priority: 0.9, changeFrequency: "daily" },
  { path: "/proposer-un-espace", priority: 0.7, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.4, changeFrequency: "yearly" },
  { path: "/mentions-legales", priority: 0.2, changeFrequency: "yearly" },
  { path: "/cgu", priority: 0.2, changeFrequency: "yearly" },
  { path: "/cgv", priority: 0.2, changeFrequency: "yearly" },
  { path: "/confidentialite", priority: 0.2, changeFrequency: "yearly" },
  { path: "/cookies", priority: 0.2, changeFrequency: "yearly" },
];

/** Crawl exclusions of robots.txt: the account space, the back office, the
 * API and the auth routes (plus legacy prefixes that redirect into /app).
 * Crawl hygiene only — the server guards these routes. */
export const ROBOTS_DISALLOWED_PATHS = [
  "/app",
  "/admin",
  "/api",
  "/auth",
  "/client",
  "/partner",
  "/post-login",
];
