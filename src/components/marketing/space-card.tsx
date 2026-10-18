"use client";

import Image from "next/image";
import Link from "next/link";
import { clsx } from "clsx";
import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { FavoriteButton } from "@/components/marketing/favorite-button";
import { VerifiedBadge } from "@/components/marketing/verified-badge";
import { formatCents, SPACE_TYPE_LABELS } from "@/lib/format";
import { canOptimizeImage } from "@/lib/images";
import { isOrganizationVerified } from "@/lib/verification";
import { RatingSummary } from "@/components/reviews/star-rating";

/*
 * The rating shown here is the real average of visible client reviews
 * (domains/reviews), passed by the page — never computed or invented here.
 * It used to be derived from the space id (B-14 / UX-02), a fake review in
 * the sense of the Omnibus directive; a space without reviews shows none.
 */

export type SpaceCardData = {
  id: string;
  slug: string;
  name: string;
  type: string;
  city: string;
  capacity: number;
  amenities: string[];
  dayPriceCents: number;
  photos?: string[];
  organization: { name: string; status?: string };
  /** Only set when the caller searched "around me" — see search-geolocation.tsx. */
  distanceKm?: number | null;
  /** Whether the signed-in visitor already favorited this space.
   * `undefined` (no visitor, or the page didn't check) hides the button
   * entirely — favoriting always requires an account. */
  favorited?: boolean;
  /** Average and count of the visible reviews; absent when there are none. */
  rating?: { average: number; count: number } | null;
  /** `false` only on "Mes favoris" (PRD V1.1, R78): the space was favorited
   * but has since been unpublished or its organization suspended. Shown as
   * unavailable rather than silently dropped from the list — `undefined`
   * elsewhere means the question doesn't apply (every other listing is
   * necessarily available). */
  available?: boolean;
};

/**
 * A result card. The whole card is clickable through the title link's
 * stretched `::after` overlay rather than by wrapping the card in a <Link>:
 * the favorite button sits on top of it, and a <button> nested inside an
 * <a> is invalid HTML that screen readers announce inconsistently.
 */
export function SpaceCard({
  space,
  href,
  imagePriority = false,
}: {
  space: SpaceCardData;
  href: string;
  /** Load the photo eagerly — only for the first cards above the fold. */
  imagePriority?: boolean;
}) {
  const photo = space.photos?.[0];
  const unavailable = space.available === false;

  return (
    // A small lift on hover — spring physics, and the only motion here.
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="h-full"
    >
      <Card className="relative h-full overflow-hidden shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
        <div className="relative h-40 bg-muted">
          {photo ? (
            <Image
              src={photo}
              alt=""
              fill
              sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
              loading={imagePriority ? "eager" : "lazy"}
              fetchPriority={imagePriority ? "high" : undefined}
              unoptimized={!canOptimizeImage(photo)}
              className={clsx("object-cover", unavailable && "grayscale")}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Photo à venir
            </div>
          )}
          {unavailable ? (
            <div className="absolute left-2 top-2 rounded-full bg-foreground/85 px-2 py-0.5 text-xs font-medium text-background">
              Indisponible
            </div>
          ) : (
            isOrganizationVerified(space.organization.status) && (
              <div className="absolute left-2 top-2 rounded-full bg-background/90 backdrop-blur-sm">
                <VerifiedBadge />
              </div>
            )
          )}
          {space.favorited !== undefined && (
            <div className="absolute right-2 top-2 z-10">
              <FavoriteButton spaceId={space.id} initialFavorited={space.favorited} variant="card" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {SPACE_TYPE_LABELS[space.type] ?? space.type} · {space.city}
            {space.distanceKm != null && ` · à ${space.distanceKm.toFixed(1)} km`}
          </p>
          <h3 className="font-sans text-base font-medium text-foreground">
            {unavailable ? (
              // No link: the space is no longer published, so its sheet 404s.
              space.name
            ) : (
              <Link
                href={href}
                className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
              >
                {space.name}
              </Link>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            {space.organization.name} · jusqu&apos;à {space.capacity} pers.
          </p>
          {space.rating && space.rating.count > 0 && (
            <RatingSummary average={space.rating.average} count={space.rating.count} className="text-xs" />
          )}
          <div className="mt-1 flex items-baseline justify-between">
            <p className="text-sm font-medium text-foreground">
              {formatCents(space.dayPriceCents)}{" "}
              <span className="font-normal text-muted-foreground">/ jour</span>
            </p>
            {!unavailable && (
              <span aria-hidden="true" className="text-sm font-medium text-primary">
                Détails
              </span>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
