"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { FavoriteButton } from "@/components/marketing/favorite-button";
import { VerifiedBadge } from "@/components/marketing/verified-badge";
import { formatCents, SPACE_TYPE_LABELS } from "@/lib/format";
import { isOrganizationVerified } from "@/lib/verification";

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
};

export function SpaceCard({
  space,
  href,
}: {
  space: SpaceCardData;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      {/* A small lift on hover — spring physics rather than a linear CSS
       * transition, and the only motion here: nothing on this card is
       * hidden or delayed at load, this only ever runs in response to a
       * real hover/focus. */}
      <motion.div whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
        <Card className="overflow-hidden shadow-sm transition-shadow hover:shadow-md">
          <div className="relative">
            {space.photos && space.photos.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={space.photos[0]} alt="" className="h-40 w-full object-cover" />
            ) : (
              <div className="flex h-40 items-center justify-center bg-muted text-sm text-muted-foreground">
                Photo à venir
              </div>
            )}
            {isOrganizationVerified(space.organization.status) && (
              <div className="absolute left-2 top-2 rounded-full bg-background/90 backdrop-blur-sm">
                <VerifiedBadge />
              </div>
            )}
            {space.favorited !== undefined && (
              <div className="absolute right-2 top-2">
                <FavoriteButton spaceId={space.id} initialFavorited={space.favorited} variant="card" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {SPACE_TYPE_LABELS[space.type] ?? space.type} · {space.city}
              {space.distanceKm != null && ` · à ${space.distanceKm.toFixed(1)} km`}
            </p>
            <p className="font-medium text-foreground">{space.name}</p>
            <p className="text-sm text-muted-foreground">
              {space.organization.name} · jusqu&apos;à {space.capacity} pers.
            </p>
            <div className="mt-1 flex items-baseline justify-between">
              <p className="text-sm font-medium text-foreground">
                {formatCents(space.dayPriceCents)}{" "}
                <span className="font-normal text-muted-foreground">/ jour</span>
              </p>
              <span className="text-sm font-medium text-accent">Détails</span>
            </div>
          </div>
        </Card>
      </motion.div>
    </Link>
  );
}
