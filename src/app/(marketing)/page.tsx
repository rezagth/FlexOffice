import { listPublishedSpaces } from "@/server/domains/spaces/list-spaces";
import { SiteHeader } from "@/components/marketing/site-header";
import { Hero } from "@/components/marketing/hero";
import { ProblemSection } from "@/components/marketing/problem-section";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { TrustBadges } from "@/components/marketing/trust-badges";
import { SpaceCard } from "@/components/marketing/space-card";
import { SiteFooter } from "@/components/marketing/site-footer";
import { EmptyState } from "@/components/dashboard/states";

// Reflects live listings — must not be statically cached at build time.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const featuredSpaces = (await listPublishedSpaces()).slice(0, 6);

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <Hero />
      <ProblemSection />

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold text-foreground">Espaces à la une</h2>
          <p className="mt-2 text-muted-foreground">
            Une sélection d&apos;espaces professionnels disponibles dès maintenant.
          </p>
          <div className="mt-8">
            {featuredSpaces.length === 0 ? (
              <EmptyState
                title="Aucun espace publié pour l'instant"
                description="Les premiers espaces publiés par nos entreprises partenaires apparaîtront ici."
              />
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {featuredSpaces.map((space) => (
                  <SpaceCard key={space.slug} space={space} href={`/spaces/${space.slug}`} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <HowItWorks />
      <TrustBadges />

      <SiteFooter />
    </div>
  );
}
