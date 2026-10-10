import { z } from "zod";
import fr from "zod/v4/locales/fr.js";

/**
 * French default messages for every Zod schema (UX-11).
 *
 * Without this, a schema with no custom message answered in English
 * ("Invalid email address", "Too small: expected string to have >=8
 * characters") and that text reached the visitor through the API error
 * envelope and the client-side forms.
 *
 * `z.config` writes to a configuration object Zod keeps on `globalThis`, so
 * one call configures every copy of Zod loaded in the same JavaScript realm.
 * It still has to run once per realm, which is why this module is imported:
 *   - on the server, by src/server/lib/http.ts (every route handler goes
 *     through withErrorHandling) and by the root layout;
 *   - in the browser, by <ZodLocale /> (src/components/zod-locale.tsx),
 *     rendered from the root layout.
 * Importing only the `fr` locale (not `z.locales`) keeps the other ~45
 * languages out of the client bundle.
 *
 * Custom messages written in a schema keep priority over these defaults.
 */
z.config(fr());

export const ZOD_LOCALE = "fr";
