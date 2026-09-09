import { Check, X } from "lucide-react";

const BEFORE = [
  "Connexion wifi instable",
  "Aucun respect de la confidentialité",
  "Bruit de fond permanent",
];

const AFTER = [
  "Fibre sécurisée & visioconférence",
  "Isolation phonique totale",
  "Accueil client haut de gamme",
];

/**
 * Real photography (Unsplash License — free for commercial use), same
 * reasoning as Hero: no photo asset of this repo's own exists for either
 * scene, so these are sourced rather than left as flat color bands.
 */
export function ProblemSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Un café n&apos;est pas un bureau.
        </h2>
        <p className="mt-2 text-muted-foreground">
          L&apos;image de votre entreprise commence par l&apos;endroit où vous recevez vos
          partenaires.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-6 text-left sm:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="relative h-40">
              {/* eslint-disable-next-line @next/next/no-img-element -- external decorative photo */}
              <img
                src="https://images.unsplash.com/photo-1745815607414-043458ad3bc0?auto=format&fit=crop&w=1200&q=80"
                alt=""
                className="h-full w-full grayscale object-cover"
              />
              <span className="absolute left-4 top-4 rounded-full bg-foreground/85 px-3 py-1 text-xs font-medium uppercase tracking-wide text-background">
                Bruyant &amp; public
              </span>
            </div>
            <div className="p-6">
              <p className="font-medium text-foreground">Le café du coin</p>
              <ul className="mt-3 flex flex-col gap-2.5 text-sm text-foreground">
                {BEFORE.map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-danger"
                    >
                      <X className="size-3 text-background" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-foreground">
            <div className="relative h-40">
              {/* eslint-disable-next-line @next/next/no-img-element -- external decorative photo */}
              <img
                src="https://images.unsplash.com/photo-1706074740295-d7a79c079562?auto=format&fit=crop&w=1200&q=80"
                alt=""
                className="h-full w-full object-cover"
              />
              <span className="absolute left-4 top-4 rounded-full bg-accent px-3 py-1 text-xs font-medium uppercase tracking-wide text-accent-foreground">
                Précision OfficeFlex
              </span>
            </div>
            <div className="p-6">
              <p className="font-medium text-accent">Bureau OfficeFlex</p>
              <ul className="mt-3 flex flex-col gap-2.5 text-sm text-background/90">
                {AFTER.map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary"
                    >
                      <Check className="size-3 text-primary-foreground" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
