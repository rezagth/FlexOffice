"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * "Autour de moi" — reads the browser's geolocation and puts it in the URL
 * (`lat`/`lng`), which `listPublishedSpaces()` reads to sort by distance.
 *
 * Prompted automatically on first load rather than waiting for a click —
 * the closest this can get to "forcer la géolocalisation" a browser
 * actually allows: the permission prompt itself is the browser's, never
 * skippable, so this asks immediately instead of behind an extra click.
 * A visitor who dismisses it keeps browsing by city, exactly as before.
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
        setStatus("idle");
        router.push(`/search?${params.toString()}`);
      },
      () => setStatus("denied"),
      { timeout: 8000 }
    );
  }

  // Prompt once automatically, unless the URL already carries a position
  // (e.g. the visitor just cleared it, or shared a link with one). Deferred
  // to a macrotask rather than calling locate() (which sets state
  // synchronously) directly in the effect body — react-hooks flags a
  // setState reachable synchronously from an effect as a cascading-render
  // risk; queuing it breaks that synchronous chain.
  useEffect(() => {
    if (hasCoords) return;
    const timer = setTimeout(locate, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hasCoords) {
    return (
      <p className="text-sm text-muted-foreground">
        Trié par distance autour de vous.{" "}
        <button
          type="button"
          className="underline hover:no-underline"
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("lat");
            params.delete("lng");
            router.push(`/search?${params.toString()}`);
          }}
        >
          Réinitialiser
        </button>
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={locate} disabled={status === "locating"}>
        {status === "locating" ? "Localisation…" : "Utiliser ma position"}
      </Button>
      {status === "denied" && (
        <p className="text-xs text-muted-foreground">
          Localisation refusée — recherchez par ville à la place.
        </p>
      )}
      {status === "unsupported" && (
        <p className="text-xs text-muted-foreground">
          Votre navigateur ne propose pas la géolocalisation.
        </p>
      )}
    </div>
  );
}
