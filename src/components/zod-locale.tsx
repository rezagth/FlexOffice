"use client";

// Side-effect import: configures Zod's French messages in the browser realm.
// See src/lib/validation/zod-locale.ts.
import "@/lib/validation/zod-locale";

/** Renders nothing — exists so the root layout ships the locale config to
 * the client bundle before any form validates input. */
export function ZodLocale() {
  return null;
}
