import { notFound } from "next/navigation";
import { getPublishedSpaceBySlug } from "@/server/domains/spaces/list-spaces";
import { getAuthContext } from "@/server/auth/rbac";
import { SiteHeader } from "@/components/marketing/site-header";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { formatCents, SPACE_TYPE_LABELS } from "@/lib/format";

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

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        {space.photos.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground">
            Aucune photo pour cet espace
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={space.photos[0]}
              alt={space.name}
              className="h-64 w-full rounded-2xl object-cover sm:h-80"
            />
            {space.photos.length > 1 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
                {space.photos.slice(1, 3).map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo}
                    src={photo}
                    alt=""
                    className="h-32 w-full rounded-2xl object-cover sm:h-[9.5rem]"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {SPACE_TYPE_LABELS[space.type] ?? space.type} · {space.city}
              </p>
              <h1 className="text-2xl font-semibold text-foreground">{space.name}</h1>
              <p className="text-sm text-muted-foreground">
                Proposé par {space.organization.name} · jusqu&apos;à {space.capacity}{" "}
                personnes
              </p>
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
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Demi-journée</span>
              <span className="font-medium">{formatCents(space.halfDayPriceCents)}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
              <span className="text-sm text-muted-foreground">Journée</span>
              <span className="font-medium">{formatCents(space.dayPriceCents)}</span>
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
      </main>
    </div>
  );
}
