"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Window event the consent banner listens to in order to reopen its
 * preferences panel. The banner calls `event.preventDefault()` to signal it
 * handled the request; if nothing does (no banner on this instance yet),
 * the button explains how to act from the browser instead of silently
 * doing nothing. */
export const OPEN_COOKIE_PREFERENCES_EVENT = "officeflex:open-cookie-preferences";

export function ManageCookiesButton() {
  const [unhandled, setUnhandled] = useState(false);

  function handleClick() {
    const event = new CustomEvent(OPEN_COOKIE_PREFERENCES_EVENT, { cancelable: true });
    // dispatchEvent returns false when a listener called preventDefault().
    setUnhandled(window.dispatchEvent(event));
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="outline" size="sm" onClick={handleClick}>
        Gérer les cookies
      </Button>
      {unhandled && (
        <p role="status" className="text-sm text-muted-foreground">
          Aucun traceur soumis à consentement n&apos;est actif sur ce site pour le moment. Vous
          pouvez à tout moment supprimer les cookies depuis les réglages de votre navigateur.
        </p>
      )}
    </div>
  );
}
