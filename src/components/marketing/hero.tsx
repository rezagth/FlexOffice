import Image from "next/image";
import { HeroSearch } from "./hero-search";

/**
 * Landing hero. The background is a local illustration in public/images
 * (UX-18): it used to be hot-linked from images.unsplash.com, a third-party
 * request on every visit and a page whose largest element depended on it.
 * It is the LCP element, hence `preload` (Next 16's replacement for
 * `priority`) and `fetchPriority="high"`.
 *
 * `surface-dark` turns focus rings gold on the navy background (UX-19); the
 * white search card resets them to navy.
 */
export function Hero() {
  return (
    <section className="surface-dark relative overflow-hidden bg-foreground">
      <Image
        src="/images/hero-office.svg"
        alt=""
        fill
        preload
        fetchPriority="high"
        sizes="100vw"
        className="object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/70 to-foreground/30"
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center sm:py-28">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-background sm:text-5xl">
          Recevez vos clients dans un vrai espace professionnel.
        </h1>
        <p className="max-w-2xl text-base text-background/85 sm:text-lg">
          Réservez un bureau d&apos;entreprise à la journée ou à la demi-journée, sans
          abonnement.
        </p>

        <HeroSearch />
      </div>
    </section>
  );
}
