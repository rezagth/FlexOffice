"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

/**
 * The space detail page's photo gallery — the brief calls this page the
 * most decisive step of the client journey, so it shows every photo a
 * partner uploaded, not just the first three.
 *
 * Swiping is native CSS scroll-snap on a horizontally scrolling track, not
 * hand-rolled touch-gesture math: a `scroll` listener derives the current
 * index from `scrollLeft`, and the prev/next buttons and thumbnails just
 * call `scrollTo()` — no extra dependency, no custom drag/velocity code.
 */
export function PhotoCarousel({ photos, spaceName }: { photos: string[]; spaceName: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const total = photos.length;

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    function onScroll() {
      if (!track || track.clientWidth === 0) return;
      const nextIndex = Math.round(track.scrollLeft / track.clientWidth);
      setIndex((current) => (current === nextIndex ? current : nextIndex));
    }
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, [total]);

  if (total === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground sm:h-96">
        Aucune photo pour cet espace
      </div>
    );
  }

  function scrollToIndex(target: number) {
    const track = trackRef.current;
    const clamped = Math.max(0, Math.min(target, total - 1));
    track?.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollToIndex(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollToIndex(index + 1);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-roledescription="carrousel"
        aria-label={`Photos de ${spaceName}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="relative overflow-hidden rounded-2xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          ref={trackRef}
          className="flex h-64 snap-x snap-mandatory overflow-x-auto scroll-smooth sm:h-96"
        >
          {photos.map((photo, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo}
              src={photo}
              alt={`Photo ${i + 1} sur ${total} de ${spaceName}`}
              className="h-full w-full shrink-0 snap-start object-cover"
            />
          ))}
        </div>

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => scrollToIndex(index - 1)}
              disabled={index === 0}
              aria-label="Photo précédente"
              className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm transition-opacity disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollToIndex(index + 1)}
              disabled={index === total - 1}
              aria-label="Photo suivante"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm transition-opacity disabled:opacity-40"
            >
              <ChevronRight aria-hidden="true" />
            </button>
            <span
              aria-hidden="true"
              className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white"
            >
              {index + 1} / {total}
            </span>
          </>
        )}
      </div>

      {total > 1 && (
        <div role="tablist" aria-label="Miniatures des photos" className="flex gap-2 overflow-x-auto">
          {photos.map((photo, i) => (
            <button
              key={photo}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Aller à la photo ${i + 1} sur ${total}`}
              onClick={() => scrollToIndex(i)}
              className={clsx(
                "h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                i === index ? "border-accent" : "border-transparent"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
