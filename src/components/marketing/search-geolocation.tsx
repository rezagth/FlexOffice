"use client";

import { useState } from "react";
import { LocateFixed } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * "Autour de moi" — reads the browser's geolocation and puts it in the URL
 * (`lat`/`lng`), which the search reads to sort by distance.
 *
 * Asked only when the visitor clicks the button (B-18 / UX-04). It used to
 * prompt on page load: an unexplained permission prompt is the pattern
 * browsers penalise, and with the old `Permissions-Policy: geolocation=()`
 * the call failed at once, so every visitor read "Localisation refusée"
 * without having done anything. next.config.ts now allows geolocation for
 * our own origin.
 */
export function SearchGeolocation() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"idle" | "locating" | "denied" | "unsupported">("idle");
  const hasCoords = searchParams.has("lat") && searchParams.has("lng");

  function locate() {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("lat", position.coords.latitude.toFixed(6));
        params.set("lng", position.coords.longitude.toFixed(6));
        params.delete("page");
        setStatus("idle");
        router.push(`/search?${params.toString()}`);
      },
      () => setStatus("denied"),
      { timeout: 8000 }
    );
  }

  if (hasCoords) {
    return (
      <p className="text-sm text-muted-foreground">
        Trié par distance autour de vous.{" "}
        <button
          type="button"
          className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("lat");
            params.delete("lng");
            params.delete("page");
            router.push(`/search?${params.toString()}`);
          }}
        >
          Ne plus utiliser ma position
        </button>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={locate} disabled={status === "locating"}>
        <LocateFixed aria-hidden="true" />
        {status === "locating" ? "Localisation…" : "Autour de moi"}
      </Button>
      <p role="status" className="text-xs text-muted-foreground">
        {status === "denied" && "Position non disponible — recherchez par ville à la place."}
        {status === "unsupported" && "Votre navigateur ne propose pas la géolocalisation."}
      </p>
    </div>
  );
}
