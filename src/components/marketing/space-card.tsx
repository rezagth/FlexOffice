import Link from "next/link";
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
    <Link href={href} className="group block">
      <Card className="overflow-hidden transition-shadow group-hover:shadow-md">
        <div className="relative">
          {space.photos && space.photos.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={space.photos[0]} alt="" className="h-40 w-full object-cover" />
          ) : (
            <div className="flex h-40 items-center justify-center bg-muted text-sm text-muted-foreground">
              Photo à venir
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
          {isOrganizationVerified(space.organization.status) && <VerifiedBadge />}
          <p className="mt-1 text-sm font-medium text-foreground">
            {formatCents(space.dayPriceCents)}{" "}
            <span className="font-normal text-muted-foreground">/ jour</span>
          </p>
        </div>
      </Card>
    </Link>
  );
}
