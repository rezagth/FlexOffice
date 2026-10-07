import type { Metadata, Viewport } from "next";
import "./globals.css";
// Server realm: French Zod messages for anything rendered or validated here.
import "@/lib/validation/zod-locale";
import { cn } from "@/lib/utils";
import { MotionProvider } from "@/components/motion-provider";
import { ZodLocale } from "@/components/zod-locale";
import { DEFAULT_OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from "@/lib/site";
import { inter, jakarta } from "./fonts";

const DEFAULT_TITLE = "OfficeFlex — Réservez un espace professionnel à la demande";

/**
 * Site-wide metadata defaults (UX-10).
 *
 * `metadataBase` comes from APP_URL (http://localhost:3000 when unset — demo
 * mode must keep rendering). Note that it is resolved when the metadata is
 * generated: for statically prerendered pages that is at build time, so the
 * production image must be built with the production APP_URL (one image per
 * environment, see audit B-23).
 *
 * Pages override `title`/`description` and, for a space, the OpenGraph image;
 * everything else falls back to these values.
 */
export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(getSiteUrl()),
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    openGraph: {
      type: "website",
      locale: "fr_FR",
      siteName: SITE_NAME,
      title: DEFAULT_TITLE,
      description: SITE_DESCRIPTION,
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: DEFAULT_TITLE,
      description: SITE_DESCRIPTION,
      images: [DEFAULT_OG_IMAGE.url],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#041627",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={cn("h-full", "antialiased", "font-sans", inter.variable, jakarta.variable)}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ZodLocale />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
