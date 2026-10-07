import { listPublishedSpaces } from "@/server/domains/spaces/list-spaces";
import { SiteHeader } from "@/components/marketing/site-header";
import { Hero } from "@/components/marketing/hero";
import { ProblemSection } from "@/components/marketing/problem-section";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { TrustBadges } from "@/components/marketing/trust-badges";
import { SearchResultsGrid } from "@/components/marketing/search-results-grid";
import { SiteFooter } from "@/components/marketing/site-footer";
import { EmptyState } from "@/components/dashboard/states";
import { absoluteUrl, pageMetadata, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { jsonLd } from "@/lib/json-ld";

export const metadata = pageMetadata({
  title: "MakomSpace — Réservez un espace professionnel à la demande",
  description: SITE_DESCRIPTION,
  path: "/",
});

// Reflects live listings — must not be statically cached at build time.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const featuredSpaces = await listPublishedSpaces({ limit: 6 });

  // schema.org Organization (UX-10). No logo/sameAs yet: the rebrand will
  // bring the final logo, and there are no official social profiles.
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    description: SITE_DESCRIPTION,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: absoluteUrl("/contact"),
      availableLanguage: "French",
    },
  };

  return (
    <div className="flex flex-1 flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organization) }} />
      <SiteHeader />
      <main id="contenu" className="flex flex-1 flex-col">
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
                <SearchResultsGrid spaces={featuredSpaces} />
              )}
            </div>
          </div>
        </section>

        <HowItWorks />
        <TrustBadges />
      </main>

      <SiteFooter />
    </div>
  );
}
