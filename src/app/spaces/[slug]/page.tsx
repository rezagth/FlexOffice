import { notFound } from "next/navigation";
import { getPublishedSpaceBySlug } from "@/server/domains/spaces/list-spaces";
import { getAuthContext } from "@/server/auth/rbac";
import { isDatabaseConfigured } from "@/server/auth/runtime-config";
import { isSpaceFavorited } from "@/server/domains/favorites/favorites";
import { SiteHeader } from "@/components/marketing/site-header";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { FavoriteButton } from "@/components/marketing/favorite-button";
import { VerifiedBadge } from "@/components/marketing/verified-badge";
import { PhotoCarousel } from "@/components/marketing/photo-carousel";
import { FadeIn } from "@/components/ui/fade-in";
import { formatCents, SPACE_TYPE_LABELS } from "@/lib/format";
import { isOrganizationVerified } from "@/lib/verification";

export default async function SpaceDetailPage({
  params,
}: PageProps<"/spaces/[slug]">) {
  const { slug } = await params;
  const [space, ctx] = await Promise.all([
    getPublishedSpaceBySlug(slug),
    getAuthContext(),
  ]);
  if (!space) {
    notFound();
  }

  // Same demo-mode guard as /search: no real Favorite table to query
  // without a database, and no favorite state for a signed-out visitor.
  const favorited =
    ctx && isDatabaseConfigured() ? await isSpaceFavorited(ctx.userId, space.id) : null;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <FadeIn className="flex flex-col gap-6">
          <PhotoCarousel photos={space.photos} spaceName={space.name} />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {SPACE_TYPE_LABELS[space.type] ?? space.type} · {space.city}
                  </p>
                  <h1 className="text-2xl font-semibold text-foreground">{space.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    Proposé par {space.organization.name} · jusqu&apos;à {space.capacity}{" "}
                    personnes
                  </p>
                  {isOrganizationVerified(space.organization.status) && (
                    <div className="mt-2">
                      <VerifiedBadge />
                    </div>
                  )}
                </div>
                {favorited !== null && (
                  <FavoriteButton spaceId={space.id} initialFavorited={favorited} variant="detail" />
                )}
              </div>

              <p className="text-sm leading-relaxed text-foreground">{space.description}</p>

              {space.amenities.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-foreground">Équipements</h2>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {space.amenities.map((amenity) => (
                      <li
                        key={amenity}
                        className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
                      >
                        {amenity}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <Card className="h-fit p-5">
              {space.discountPercent ? (
                <p className="mb-3 inline-flex w-fit rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                  -{space.discountPercent}%
                </p>
              ) : null}
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Demi-journée</span>
                <PriceWithDiscount cents={space.halfDayPriceCents} discountPercent={space.discountPercent} />
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
                <span className="text-sm text-muted-foreground">Journée</span>
                <PriceWithDiscount cents={space.dayPriceCents} discountPercent={space.discountPercent} />
              </div>

              {ctx ? (
                <ButtonLink href={`/spaces/${space.slug}/booking`} className="mt-5 w-full">
                  Réserver
                </ButtonLink>
              ) : (
                <ButtonLink
                  href={`/login?redirectTo=/spaces/${space.slug}`}
                  className="mt-5 w-full"
                >
                  Connectez-vous pour réserver
                </ButtonLink>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Vous ne serez débité qu&apos;après acceptation par l&apos;entreprise.
              </p>
            </Card>
          </div>
        </FadeIn>
      </main>
    </div>
  );
}

/** Mirrors the rounding in computeDaySlots()'s applyDiscount() — display
 * only, the actual charge at booking time is always computed server-side. */
function PriceWithDiscount({
  cents,
  discountPercent,
}: {
  cents: number;
  discountPercent: number | null;
}) {
  if (!discountPercent) {
    return <span className="font-medium">{formatCents(cents)}</span>;
  }
  const discounted = Math.floor((cents * (100 - discountPercent)) / 100);
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-xs text-muted-foreground line-through">{formatCents(cents)}</span>
      <span className="font-medium">{formatCents(discounted)}</span>
    </span>
  );
}
