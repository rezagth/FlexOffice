import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarX, Clock, MapPin } from "lucide-react";
import { getPublishedSpaceBySlug } from "@/server/domains/spaces/list-spaces";
import { getAuthContext } from "@/server/auth/rbac";
import { isDatabaseConfigured } from "@/server/auth/runtime-config";
import { isSpaceFavorited } from "@/server/domains/favorites/favorites";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { FavoriteButton } from "@/components/marketing/favorite-button";
import { VerifiedBadge } from "@/components/marketing/verified-badge";
import { PhotoCarousel } from "@/components/marketing/photo-carousel";
import { FadeIn } from "@/components/ui/fade-in";
import { formatCents, SPACE_AMENITY_LABELS, SPACE_TYPE_LABELS } from "@/lib/format";
import { isOrganizationVerified } from "@/lib/verification";
import {
  FULL_REFUND_MIN_HOURS,
  PARTIAL_REFUND_MIN_HOURS,
  PARTIAL_REFUND_PERCENT,
} from "@/lib/cancellation-policy";
import { openingHoursSpecification, weeklyOpeningHours } from "@/lib/opening-hours";
import { parseSpaceSearchParams } from "@/lib/validation/search";
import { absoluteUrl, pageMetadata } from "@/lib/site";
import { jsonLd } from "@/lib/json-ld";
import { getReviewSummaries, listSpaceReviews } from "@/server/domains/reviews/reviews";
import { SpaceReviews } from "@/components/reviews/space-reviews";
import { RatingSummary } from "@/components/reviews/star-rating";

// Live listing, session-dependent (favorite, booking link): never cached.
export const dynamic = "force-dynamic";

// One database read per request, shared by generateMetadata and the page.
const getSpace = cache(getPublishedSpaceBySlug);

const DESCRIPTION_MAX = 155;

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export async function generateMetadata({ params }: PageProps<"/spaces/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const space = await getSpace(slug);
  if (!space) return { title: "Espace introuvable — MakomSpace", robots: { index: false } };

  const type = SPACE_TYPE_LABELS[space.type] ?? space.type;
  const photo = space.photos[0];
  return pageMetadata({
    title: `${space.name} — ${type} à ${space.city} | MakomSpace`,
    description: truncate(
      `${type} à ${space.city}, jusqu'à ${space.capacity} personnes, à partir de ${formatCents(space.halfDayPriceCents)} la demi-journée. ${space.description}`,
      DESCRIPTION_MAX
    ),
    path: `/spaces/${space.slug}`,
    // An SVG (demo illustrations) is not accepted by social networks: keep
    // the default image then.
    image: photo && !photo.endsWith(".svg") ? { url: photo, alt: space.name } : undefined,
  });
}

/** Summary of src/lib/cancellation-policy.ts — the same constants the
 * server uses to compute a refund, so the page cannot drift from the rule. */
function cancellationSummary(): string[] {
  return [
    "Annulation gratuite tant que l'entreprise n'a pas accepté votre demande.",
    `Plus de ${FULL_REFUND_MIN_HOURS} h avant le début : la location est remboursée intégralement.`,
    `Entre ${FULL_REFUND_MIN_HOURS} h et ${PARTIAL_REFUND_MIN_HOURS} h avant : ${PARTIAL_REFUND_PERCENT} % de la location est remboursé.`,
    `Moins de ${PARTIAL_REFUND_MIN_HOURS} h avant : aucun remboursement.`,
    "Les frais de service MakomSpace ne sont pas remboursables, sauf annulation par l'entreprise.",
  ];
}

export default async function SpaceDetailPage({
  params,
  searchParams,
}: PageProps<"/spaces/[slug]">) {
  const { slug } = await params;
  const [space, ctx] = await Promise.all([getSpace(slug), getAuthContext()]);
  if (!space) {
    notFound();
  }

  // The date chosen on /search (validated, otherwise dropped) is carried to
  // the booking page (UX-16).
  const { date: rawDate } = await searchParams;
  const date = parseSpaceSearchParams({ date: rawDate }).date;
  const bookingHref = `/spaces/${space.slug}/booking${date ? `?date=${date}` : ""}`;

  // Same demo-mode guard as /search: no real Favorite table to query
  // without a database, and no favorite state for a signed-out visitor.
  const favorited =
    ctx && isDatabaseConfigured() ? await isSpaceFavorited(ctx.userId, space.id) : null;

  // Demo mode has no review table: no section content, never an error.
  const [reviewSummary, reviews] = isDatabaseConfigured()
    ? await Promise.all([
        getReviewSummaries([space.id]).then((map) => map.get(space.id) ?? null),
        listSpaceReviews(space.id),
      ])
    : [null, []];

  const typeLabel = SPACE_TYPE_LABELS[space.type] ?? space.type;
  const hours = weeklyOpeningHours(space.openingHours);
  const hasHours = space.openingHours.length > 0;
  const timezone = "timezone" in space && typeof space.timezone === "string" ? space.timezone : null;

  // schema.org Place + Offer (UX-10). Only public fields — the same ones the
  // page already displays.
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: space.name,
    description: space.description,
    url: absoluteUrl(`/spaces/${space.slug}`),
    ...(space.photos.length
      ? { image: space.photos.map((p) => (p.startsWith("/") ? absoluteUrl(p) : p)) }
      : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: space.address,
      postalCode: space.postalCode,
      addressLocality: space.city,
      addressCountry: "FR",
    },
    maximumAttendeeCapacity: space.capacity,
    ...(reviewSummary && reviewSummary.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: reviewSummary.average,
            reviewCount: reviewSummary.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(hasHours ? { openingHoursSpecification: openingHoursSpecification(space.openingHours) } : {}),
    makesOffer: [
      { name: "Demi-journée", cents: space.halfDayPriceCents },
      { name: "Journée", cents: space.dayPriceCents },
    ].map((offer) => ({
      "@type": "Offer",
      name: offer.name,
      price: (offer.cents / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
      url: absoluteUrl(`/spaces/${space.slug}`),
    })),
  };

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        // Escaped by jsonLd(): partner text cannot close the script tag.
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <SiteHeader />
      <main id="contenu" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <FadeIn className="flex flex-col gap-6">
          <PhotoCarousel photos={space.photos} spaceName={space.name} />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {typeLabel} · {space.city}
                  </p>
                  <h1 className="text-2xl font-semibold text-foreground">{space.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    Proposé par {space.organization.name} · jusqu&apos;à {space.capacity}{" "}
                    personnes
                  </p>
                  {reviewSummary && reviewSummary.count > 0 && (
                    <a href="#reviews-heading" className="mt-1 inline-block hover:underline">
                      <RatingSummary average={reviewSummary.average} count={reviewSummary.count} />
                    </a>
                  )}
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

              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                {space.description}
              </p>

              {space.amenities.length > 0 && (
                <section aria-labelledby="amenities-heading">
                  <h2 id="amenities-heading" className="text-base font-semibold text-foreground">
                    Équipements
                  </h2>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {space.amenities.map((amenity) => (
                      <li
                        key={amenity}
                        className="rounded-full bg-muted px-3 py-1 text-xs text-foreground"
                      >
                        {SPACE_AMENITY_LABELS[amenity] ?? amenity}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <section aria-labelledby="address-heading">
                  <h2
                    id="address-heading"
                    className="flex items-center gap-2 text-base font-semibold text-foreground"
                  >
                    <MapPin aria-hidden="true" className="size-4 text-muted-foreground" />
                    Adresse
                  </h2>
                  <address className="mt-2 text-sm not-italic text-foreground">
                    {space.address}
                    <br />
                    {space.postalCode} {space.city}
                  </address>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Les instructions d&apos;accès sont envoyées une fois la réservation confirmée.
                  </p>
                </section>

                <section aria-labelledby="hours-heading">
                  <h2
                    id="hours-heading"
                    className="flex items-center gap-2 text-base font-semibold text-foreground"
                  >
                    <Clock aria-hidden="true" className="size-4 text-muted-foreground" />
                    Horaires d&apos;ouverture
                  </h2>
                  {hasHours ? (
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      {hours.map(({ day, hours: value }) => (
                        <div key={day} className="contents">
                          <dt className="text-muted-foreground">{day}</dt>
                          <dd className="text-foreground">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Horaires non renseignés : les créneaux disponibles sont affichés à la
                      réservation.
                    </p>
                  )}
                  {hasHours && timezone && (
                    <p className="mt-1 text-xs text-muted-foreground">Heure locale ({timezone}).</p>
                  )}
                </section>
              </div>

              <section aria-labelledby="cancellation-heading">
                <h2
                  id="cancellation-heading"
                  className="flex items-center gap-2 text-base font-semibold text-foreground"
                >
                  <CalendarX aria-hidden="true" className="size-4 text-muted-foreground" />
                  Conditions d&apos;annulation
                </h2>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-foreground">
                  {cancellationSummary().map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>

              <SpaceReviews
                summary={reviewSummary}
                reviews={reviews}
                organizationName={space.organization.name}
              />
            </div>

            <Card className="h-fit p-5 lg:sticky lg:top-24">
              {space.discountPercent ? (
                <p className="mb-3 inline-flex w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
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

              {date && (
                <p className="mt-4 text-sm text-foreground">
                  Date choisie :{" "}
                  <span className="font-medium">
                    {new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      timeZone: "UTC",
                    })}
                  </span>
                </p>
              )}

              {ctx ? (
                <ButtonLink href={bookingHref} className="mt-5 w-full">
                  Réserver
                </ButtonLink>
              ) : (
                <ButtonLink
                  href={`/login?redirectTo=${encodeURIComponent(bookingHref)}`}
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
      <SiteFooter />
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
