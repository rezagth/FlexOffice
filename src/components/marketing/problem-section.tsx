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
 * No photography backs either card (same reason as Hero — see its
 * comment): the top band of each card is a flat tone standing in for the
 * mockup's black-and-white "café" photo and interior shot.
 *
 * The "after" card's checkmarks use text-background rather than
 * text-primary: --primary is a dark teal, too close in luminance to this
 * card's --foreground background to clear icon contrast — text-background
 * (near-white) does.
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
            <div className="relative flex h-32 items-end bg-muted p-4">
              <span className="rounded-full bg-foreground/85 px-3 py-1 text-xs font-medium uppercase tracking-wide text-background">
                Bruyant &amp; public
              </span>
            </div>
            <div className="p-6">
              <p className="font-medium text-foreground">Le café du coin</p>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
                {BEFORE.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <X aria-hidden="true" className="size-4 shrink-0 text-danger" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-foreground">
            <div className="relative flex h-32 items-end bg-primary/25 p-4">
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary-foreground">
                Précision OfficeFlex
              </span>
            </div>
            <div className="p-6">
              <p className="font-medium text-background">Bureau OfficeFlex</p>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-background/90">
                {AFTER.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check aria-hidden="true" className="size-4 shrink-0 text-background" />
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
