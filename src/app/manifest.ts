import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

/** Web app manifest — brand colours, French, provisional "OF" icons until
 * the rebrand ships the final logo. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — espaces professionnels à la demande`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "fr",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f9fa",
    theme_color: "#041627",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
