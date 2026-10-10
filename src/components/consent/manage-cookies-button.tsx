"use client";

import { openConsentPreferences } from "./consent-store";

/**
 * "Gérer les cookies" — reopens the consent panel so a visitor can withdraw
 * as easily as they consented. Meant for the site footer:
 *
 *   import { ManageCookiesButton } from "@/components/consent/manage-cookies-button";
 *   <li><ManageCookiesButton className="hover:text-background" /></li>
 *
 * Any other client code can call `openConsentPreferences()` from
 * ./consent-store, or dispatch the `officeflex:consent:open` window event.
 */
export function ManageCookiesButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openConsentPreferences} className={className}>
      Gérer les cookies
    </button>
  );
}
