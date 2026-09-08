"use client";

import { useState, useTransition } from "react";
import { clsx } from "clsx";

/**
 * Toggles a space in the caller's favorites via POST/DELETE
 * /api/favorites — see src/app/api/favorites/. Optimistic: flips
 * immediately, reverts if the request fails. Only ever rendered for a
 * signed-in visitor (the page decides that, not this component — see
 * SpaceCard's `favorited === undefined` convention).
 */
export function FavoriteButton({
  spaceId,
  initialFavorited,
  variant = "card",
}: {
  spaceId: string;
  initialFavorited: boolean;
  /** "card" floats over a SpaceCard's photo; "detail" is an inline button
   * for the space detail page. */
  variant?: "card" | "detail";
}) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [isPending, startTransition] = useTransition();

  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    // SpaceCard wraps this in a <Link> — never navigate on a favorite click.
    event.preventDefault();
    event.stopPropagation();

    const next = !favorited;
    setFavorited(next);

    startTransition(async () => {
      try {
        const res = next
          ? await fetch("/api/favorites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ spaceId }),
            })
          : await fetch(`/api/favorites/${spaceId}`, { method: "DELETE" });
        if (!res.ok) setFavorited(!next);
      } catch {
        setFavorited(!next);
      }
    });
  }

  const label = favorited ? "Retirer des favoris" : "Ajouter aux favoris";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={favorited}
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-50",
        variant === "card"
          ? "h-9 w-9 bg-card/90 text-foreground shadow-sm hover:bg-card"
          : "h-11 w-11 border border-border bg-card text-foreground hover:bg-muted"
      )}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={clsx("h-5 w-5", favorited ? "fill-accent stroke-accent" : "fill-none stroke-current")}
        strokeWidth={1.8}
      >
        <path d="M12 20.6 4.6 13.2a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5L12 20.6Z" />
      </svg>
    </button>
  );
}
