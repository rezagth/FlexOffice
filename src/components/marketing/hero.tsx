import { ButtonLink } from "@/components/ui/button";
import { HeroSearch } from "./hero-search";

/**
 * No stock photo backs this section: the repo ships no hero photography
 * asset (public/ has none, mock spaces have empty photo arrays), and
 * hot-linking one from an external host isn't something to fabricate for
 * production code. The dark brand-toned gradient stands in for the
 * mockup's meeting-room photo — swap in a real photo asset here if one
 * becomes available.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-foreground">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--primary)_0%,_transparent_55%)] opacity-50"
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-20 text-center sm:py-28">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-background sm:text-5xl">
          Recevez vos clients dans un vrai espace professionnel.
        </h1>
        <p className="max-w-2xl text-base text-background/80 sm:text-lg">
          Réservez un bureau d&apos;entreprise à la demi-journée ou à la journée, sans
          engagement ni abonnement.
        </p>

        <HeroSearch />

        {/* Dual CTA required by officeflex-context §7.1 ("Hero... double
         * CTA") — kept and restyled for the darker hero rather than
         * dropped, since the supplied mockup doesn't show it but the
         * product spec calls for it. */}
        <div className="grid w-full max-w-2xl grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
          <div className="flex flex-col items-start gap-2 rounded-2xl border border-background/15 bg-background/10 p-5 text-left backdrop-blur-sm">
            <p className="text-sm font-medium text-background/70">Locataire</p>
            <p className="text-base font-semibold text-background">
              Trouvez un espace pour votre prochain rendez-vous
            </p>
            <ButtonLink href="/search" variant="primary" size="sm">
              Trouvez un espace
            </ButtonLink>
          </div>
          <div className="flex flex-col items-start gap-2 rounded-2xl border border-background/15 bg-background/10 p-5 text-left backdrop-blur-sm">
            <p className="text-sm font-medium text-background/70">Entreprise partenaire</p>
            <p className="text-base font-semibold text-background">
              Monétisez vos espaces sous-utilisés
            </p>
            <ButtonLink href="/register" variant="secondary" size="sm">
              Publiez votre espace
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
