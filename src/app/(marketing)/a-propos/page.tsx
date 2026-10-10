import type { Metadata } from "next";
import Link from "next/link";
import { Handshake, Scale, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PageHero } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { pageMetadata, SITE_TAGLINE } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "À propos — MakomSpace",
  description:
    "MakomSpace rend utiles les espaces professionnels inoccupés : des salles et bureaux d'entreprises vérifiées, réservables à la demi-journée ou à la journée.",
  path: "/a-propos",
});

const PRINCIPLES = [
  {
    icon: Handshake,
    title: "La confiance d'abord",
    description:
      "Chaque organisation est vérifiée avant de publier, chaque avis vient d'une réservation réelle, chaque paiement passe par un prestataire agréé.",
  },
  {
    icon: Sparkles,
    title: "La simplicité",
    description:
      "Trouver et réserver un espace en quelques minutes ; publier le sien sans engagement ni abonnement.",
  },
  {
    icon: Scale,
    title: "La transparence",
    description:
      "Un prix affiché tout compris, des conditions d'annulation écrites avant de réserver, une commission connue d'avance.",
  },
];

/**
 * "À propos". Deliberately no invented figures, team or customer logos: the
 * page says what the product does and how — company facts live in the
 * mentions légales, filled in by the owner.
 */
export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="contenu" className="flex-1">
        <PageHero eyebrow="À propos" title={SITE_TAGLINE} />

        <div className="mx-auto flex w-full max-w-4xl flex-col gap-14 px-4 py-14 sm:px-6">
          <section aria-labelledby="mission-title" className="flex flex-col gap-4 text-foreground">
            <h2 id="mission-title" className="text-2xl font-semibold">
              Pourquoi MakomSpace
            </h2>
            <p className="leading-relaxed">
              Dans beaucoup d&apos;entreprises, des salles de réunion et des bureaux restent vides une
              bonne partie de la semaine. Au même moment, des indépendants, des PME et des équipes en
              déplacement cherchent un lieu professionnel pour recevoir un client, animer une formation ou
              travailler au calme — et se rabattent sur un café ou un hall d&apos;hôtel.
            </p>
            <p className="leading-relaxed">
              MakomSpace relie les deux : les entreprises proposent leurs espaces inoccupés, les
              professionnels les réservent à la demi-journée ou à la journée, sans bail ni abonnement. Les
              uns rentabilisent des mètres carrés déjà payés, les autres trouvent un vrai cadre
              professionnel, au bon endroit, pour le temps qu&apos;il leur faut.
            </p>
          </section>

          <section aria-labelledby="principes-title" className="flex flex-col gap-6">
            <h2 id="principes-title" className="text-2xl font-semibold text-foreground">
              Nos principes
            </h2>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {PRINCIPLES.map((item) => (
                <li key={item.title} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
                  <span
                    aria-hidden="true"
                    className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground"
                  >
                    <item.icon className="size-5" />
                  </span>
                  <h3 className="font-sans text-base font-medium text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="qui-title" className="flex flex-col gap-3 text-foreground">
            <h2 id="qui-title" className="text-2xl font-semibold">
              Qui édite MakomSpace
            </h2>
            <p className="leading-relaxed">
              Les informations sur la société éditrice (dénomination, siège, immatriculation) figurent dans
              les{" "}
              <Link href="/mentions-legales" className="font-medium text-primary underline-offset-4 hover:underline">
                mentions légales
              </Link>
              . Pour toute question, partenariat ou demande de la presse,{" "}
              <Link href="/contact" className="font-medium text-primary underline-offset-4 hover:underline">
                écrivez-nous
              </Link>
              .
            </p>
          </section>

          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="/search">Trouver un espace</ButtonLink>
            <ButtonLink href="/proposer-un-espace" variant="outline">
              Proposer un espace
            </ButtonLink>
            <ButtonLink href="/comment-ca-marche" variant="ghost">
              Comment ça marche
            </ButtonLink>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
