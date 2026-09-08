"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from "@/components/ui/carousel";

/**
 * The space detail page's photo gallery — the brief calls this page the
 * most decisive step of the client journey, so it shows every photo a
 * partner uploaded, not just the first three.
 *
 * Built on shadcn's Carousel (Embla under the hood): swipe, drag, and
 * ArrowLeft/ArrowRight keyboard navigation all come from Embla itself,
 * not hand-rolled gesture math.
 */
export function PhotoCarousel({ photos, spaceName }: { photos: string[]; spaceName: string }) {
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);
  const total = photos.length;

  useEffect(() => {
    if (!api) return;
    // Same reasoning as carousel.tsx: syncing from Embla's own current
    // position, not from a React value available at render time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndex(api.selectedScrollSnap());
    const onSelect = () => setIndex(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  if (total === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground sm:h-96">
        Aucune photo pour cet espace
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Carousel
        setApi={setApi}
        aria-label={`Photos de ${spaceName}`}
        className="h-64 overflow-hidden rounded-2xl bg-muted sm:h-96"
      >
        <CarouselContent>
          {photos.map((photo, i) => (
            <CarouselItem key={photo}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt={`Photo ${i + 1} sur ${total} de ${spaceName}`}
                className="h-full w-full object-cover"
              />
            </CarouselItem>
          ))}
        </CarouselContent>

        {total > 1 && (
          <>
            <CarouselPrevious />
            <CarouselNext />
            <span
              aria-hidden="true"
              className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white"
            >
              {index + 1} / {total}
            </span>
          </>
        )}
      </Carousel>

      {total > 1 && (
        <div role="tablist" aria-label="Miniatures des photos" className="flex gap-2 overflow-x-auto">
          {photos.map((photo, i) => (
            <button
              key={photo}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Aller à la photo ${i + 1} sur ${total}`}
              onClick={() => api?.scrollTo(i)}
              className={cn(
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
