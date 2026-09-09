import { HeroSearch } from "./hero-search";

/**
 * Real photography (Marc Wieland, Unsplash License — free for commercial
 * use, no attribution required): the repo ships no hero photo asset of its
 * own, so this is sourced rather than replaced with a flat gradient.
 *
 * No dual tenant/landlord CTA panel here: the supplied mockup's hero ends
 * at the search bar. The "publish a space" path still exists — header nav
 * and the footer both link to it — so nothing is lost, just moved.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-foreground">
      {/* eslint-disable-next-line @next/next/no-img-element -- external
       * decorative photo, not a Next-optimized local asset */}
      <img
        src="https://images.unsplash.com/photo-1774186184398-1cc2da3d029e?auto=format&fit=crop&w=2000&q=80"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/60 to-foreground/20"
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center sm:py-28">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-background sm:text-5xl">
          Recevez vos clients dans un vrai espace professionnel.
        </h1>
        <p className="max-w-2xl text-base text-background/80 sm:text-lg">
          Réservez un bureau d&apos;entreprise à la journée ou à la demi-journée, sans
          abonnement.
        </p>

        <HeroSearch />
      </div>
    </section>
  );
}
