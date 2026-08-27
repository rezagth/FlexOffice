import { ButtonLink } from "@/components/ui/button";
import { HeroSearch } from "./hero-search";

export function Hero() {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 py-16 text-center sm:py-24">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Recevez vos clients dans un vrai espace professionnel
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
          OfficeFlex met en relation des entreprises qui ont des bureaux
          sous-utilisés avec des professionnels qui cherchent une salle de réunion,
          un bureau ou un espace de formation, à la demi-journée ou à la journée —
          sans engagement.
        </p>

        <HeroSearch />

        <div className="grid w-full max-w-2xl grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
          <div className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-background p-5 text-left">
            <p className="text-sm font-medium text-muted-foreground">Locataire</p>
            <p className="text-base font-semibold text-foreground">
              Trouvez un espace pour votre prochain rendez-vous
            </p>
            <ButtonLink href="/search" variant="primary" size="sm">
              Trouvez un espace
            </ButtonLink>
          </div>
          <div className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-background p-5 text-left">
            <p className="text-sm font-medium text-muted-foreground">
              Entreprise partenaire
            </p>
            <p className="text-base font-semibold text-foreground">
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
