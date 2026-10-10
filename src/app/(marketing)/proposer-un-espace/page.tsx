import type { Metadata } from "next";
import { Building2, CalendarCheck, Coins, FileCheck2, ShieldCheck, Users } from "lucide-react";
import type { ComponentType } from "react";
import { getAuthContext } from "@/server/auth/rbac";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ButtonLink } from "@/components/ui/button";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Proposer un espace — MakomSpace",
  description:
    "Vos bureaux, salles de réunion ou de formation sont sous-utilisés ? Publiez-les sur MakomSpace et louez-les à la demi-journée ou à la journée à des professionnels.",
  path: "/proposer-un-espace",
});

// The call to action depends on the session (sign up / become a landlord /
// publish a space).
export const dynamic = "force-dynamic";

type Item = { icon: ComponentType<{ className?: string }>; title: string; description: string };

const BENEFITS: Item[] = [
  {
    icon: Coins,
    title: "Rentabilisez vos mètres carrés",
    description:
      "Une salle vide le mardi après-midi devient un revenu. Vous fixez vos prix à la demi-journée et à la journée.",
  },
  {
    icon: CalendarCheck,
    title: "Vous gardez la main",
    description:
      "Chaque demande vous est soumise : vous l'acceptez ou la refusez. Vos horaires et vos fermetures bloquent automatiquement les créneaux.",
  },
  {
    icon: ShieldCheck,
    title: "Des locataires professionnels",
    description:
      "Les réservations sont faites par des comptes identifiés, et le paiement est autorisé avant que vous n'acceptiez.",
  },
];

const STEPS: Item[] = [
  {
    icon: Users,
    title: "Créez votre compte",
    description: "Inscrivez-vous en choisissant « Je publie un espace ».",
  },
  {
    icon: FileCheck2,
    title: "Faites vérifier votre entreprise",
    description:
      "Nous vérifions votre société (SIRET, coordonnées) avant toute publication, pour la confiance de tous.",
  },
  {
    icon: Building2,
    title: "Décrivez vos espaces",
    description:
      "Adresse, capacité, équipements, photos, horaires et prix. Chaque annonce est relue avant d'être mise en ligne.",
  },
  {
    icon: Coins,
    title: "Recevez vos paiements",
    description:
      "Le client paie en ligne ; le montant vous est reversé sur votre compte, commission MakomSpace déduite.",
  },
];

function ItemList({ items, ordered = false }: { items: Item[]; ordered?: boolean }) {
  const List = ordered ? "ol" : "ul";
  return (
    <List className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => (
        <li key={item.title} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground"
          >
            <item.icon className="size-5" />
          </span>
          <h3 className="font-sans text-base font-medium text-foreground">
            {ordered && <span className="text-muted-foreground">{index + 1}. </span>}
            {item.title}
          </h3>
          <p className="text-sm text-muted-foreground">{item.description}</p>
        </li>
      ))}
    </List>
  );
}

/**
 * Landing page for companies with under-used space (UX-13): the landlord
 * half of the marketplace had no entry point for a visitor. Links to sign-up
 * — or, for a signed-in account, straight to the next real step.
 */
export default async function ProposeSpacePage() {
  const ctx = await getAuthContext();
  const cta = !ctx
    ? { href: "/register", label: "Créer mon compte entreprise" }
    : ctx.isLandlord
      ? { href: "/app/landlord/spaces/new", label: "Publier un espace" }
      : { href: "/app/become-landlord", label: "Devenir bailleur" };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="contenu" className="flex-1">
        <section className="surface-dark bg-foreground">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 py-20 text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-accent">
              Pour les entreprises
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-background sm:text-5xl">
              Vos espaces inoccupés ont de la valeur.
            </h1>
            <p className="max-w-2xl text-base text-background/85 sm:text-lg">
              Proposez vos bureaux, salles de réunion et espaces de formation à des
              professionnels, à la demi-journée ou à la journée — sans engagement.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink href={cta.href} variant="secondary" size="lg">
                {cta.label}
              </ButtonLink>
              <ButtonLink
                href="/contact"
                variant="outline"
                size="lg"
                className="border-background/40 text-background hover:bg-background/10"
              >
                Poser une question
              </ButtonLink>
            </div>
            {!ctx && (
              <p className="text-sm text-background/80">
                À l&apos;inscription, choisissez « Je publie un espace ».
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="benefits-heading" className="border-b border-border">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 id="benefits-heading" className="text-2xl font-semibold text-foreground">
              Pourquoi publier sur MakomSpace ?
            </h2>
            <div className="mt-8">
              <ul className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {BENEFITS.map((item) => (
                  <li key={item.title} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
                    <span
                      aria-hidden="true"
                      className="flex size-10 items-center justify-center rounded-full bg-foreground text-background"
                    >
                      <item.icon className="size-5" />
                    </span>
                    <h3 className="font-sans text-base font-medium text-foreground">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="steps-heading" className="border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 id="steps-heading" className="text-2xl font-semibold text-foreground">
              Comment ça marche ?
            </h2>
            <div className="mt-8">
              <ItemList items={STEPS} ordered />
            </div>
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <p className="text-muted-foreground">
                Prêt à recevoir vos premières réservations ?
              </p>
              <ButtonLink href={cta.href} size="lg">
                {cta.label}
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
