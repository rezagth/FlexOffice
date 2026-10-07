import type { Metadata } from "next";
import type { ComponentType } from "react";
import {
  BadgeCheck,
  Banknote,
  Building2,
  CalendarCheck,
  CreditCard,
  FileText,
  Inbox,
  LifeBuoy,
  Lock,
  Search,
  Star,
  UserPlus,
} from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PageHero } from "@/components/marketing/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { pageMetadata } from "@/lib/site";
import { COMMISSION_RATE } from "@/server/domains/payments/constants";
import { BOOKING_EXPIRY_HOURS } from "@/server/domains/bookings/expire-stale";

export const metadata: Metadata = pageMetadata({
  title: "Comment ça marche — MakomSpace",
  description:
    "Réservez une salle de réunion, un bureau ou un espace de formation en quelques minutes, ou proposez vos espaces inoccupés à des professionnels : le fonctionnement de MakomSpace, étape par étape.",
  path: "/comment-ca-marche",
});

type Step = { icon: ComponentType<{ className?: string }>; title: string; description: string };

const CLIENT_STEPS: Step[] = [
  {
    icon: Search,
    title: "Trouvez l'espace",
    description:
      "Cherchez par ville, date, capacité et équipements, sur la liste ou sur la carte. Sans inscription.",
  },
  {
    icon: CreditCard,
    title: "Envoyez votre demande",
    description:
      "Choisissez la demi-journée ou la journée et renseignez votre carte. Le montant est réservé, pas débité.",
  },
  {
    icon: CalendarCheck,
    title: "Recevez la confirmation",
    description: `L'entreprise répond sous ${BOOKING_EXPIRY_HOURS} h au plus. Dès qu'elle accepte, vous êtes débité et recevez l'adresse et les instructions d'accès.`,
  },
  {
    icon: Star,
    title: "Recevez vos clients",
    description:
      "Votre facture est disponible dans votre espace. Après la réservation, laissez un avis pour aider les suivants.",
  },
];

const LANDLORD_STEPS: Step[] = [
  {
    icon: UserPlus,
    title: "Créez votre compte",
    description:
      "Inscrivez-vous et faites vérifier votre organisation : c'est la condition de la confiance entre entreprises.",
  },
  {
    icon: Building2,
    title: "Décrivez vos espaces",
    description:
      "Adresse, capacité, équipements, photos, horaires, fermetures et prix. Chaque annonce est relue avant sa mise en ligne.",
  },
  {
    icon: Inbox,
    title: "Acceptez les demandes",
    description:
      "Chaque demande vous est soumise : vous acceptez ou refusez en un clic. Un créneau ne peut jamais être réservé deux fois.",
  },
  {
    icon: Banknote,
    title: "Soyez payé",
    description: `Le client paie en ligne ; vous recevez le montant, déduction faite de la commission de ${Math.round(COMMISSION_RATE * 100)} %. Les factures sont émises pour vous.`,
  },
];

const GUARANTEES: Step[] = [
  {
    icon: BadgeCheck,
    title: "Entreprises vérifiées",
    description: "Aucun espace n'est publié avant la vérification de l'organisation qui le propose.",
  },
  {
    icon: Lock,
    title: "Paiement sécurisé",
    description: "Par Stripe. Vous n'êtes débité qu'une fois la demande acceptée ; votre carte ne nous est jamais transmise.",
  },
  {
    icon: Star,
    title: "Avis vérifiés",
    description: "Seuls les clients d'une réservation qui a eu lieu peuvent laisser un avis.",
  },
  {
    icon: FileText,
    title: "Factures automatiques",
    description: "Facture à chaque paiement, avoir à chaque remboursement, téléchargeables à tout moment.",
  },
  {
    icon: LifeBuoy,
    title: "Un recours en cas de problème",
    description: "Messagerie avec l'autre partie, et signalement d'un litige examiné par l'équipe MakomSpace.",
  },
];

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <li key={step.title} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
          <span className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground"
            >
              <step.icon className="size-5" />
            </span>
            <span className="text-sm font-semibold text-muted-foreground">Étape {index + 1}</span>
          </span>
          <h3 className="font-sans text-base font-medium text-foreground">{step.title}</h3>
          <p className="text-sm text-muted-foreground">{step.description}</p>
        </li>
      ))}
    </ol>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="contenu" className="flex-1">
        <PageHero eyebrow="Comment ça marche" title="Un espace professionnel, quand vous en avez besoin.">
          <p className="max-w-2xl text-base text-background/85 sm:text-lg">
            MakomSpace met en relation les professionnels qui cherchent une salle pour quelques heures
            et les entreprises dont les espaces restent inoccupés.
          </p>
          <nav aria-label="Parcours" className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="#reserver" variant="secondary">
              Je cherche un espace
            </ButtonLink>
            <ButtonLink
              href="#proposer"
              variant="outline"
              className="border-background/40 text-background hover:bg-background/10"
            >
              Je propose un espace
            </ButtonLink>
          </nav>
        </PageHero>

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-14 sm:px-6">
          <section id="reserver" aria-labelledby="reserver-title" className="flex scroll-mt-24 flex-col gap-6">
            <div>
              <h2 id="reserver-title" className="text-2xl font-semibold text-foreground">
                Vous cherchez un espace
              </h2>
              <p className="mt-1 text-muted-foreground">
                Salle de réunion pour recevoir un client, bureau pour une journée au calme, salle de formation :
                à la demi-journée ou à la journée, sans abonnement.
              </p>
            </div>
            <Steps steps={CLIENT_STEPS} />
            <div>
              <ButtonLink href="/search">Rechercher un espace</ButtonLink>
            </div>
          </section>

          <section id="proposer" aria-labelledby="proposer-title" className="flex scroll-mt-24 flex-col gap-6">
            <div>
              <h2 id="proposer-title" className="text-2xl font-semibold text-foreground">
                Vous proposez un espace
              </h2>
              <p className="mt-1 text-muted-foreground">
                Rentabilisez vos salles et bureaux inoccupés, en gardant la main sur chaque réservation.
                Inscription et publication gratuites.
              </p>
            </div>
            <Steps steps={LANDLORD_STEPS} />
            <div>
              <ButtonLink href="/proposer-un-espace">Proposer un espace</ButtonLink>
            </div>
          </section>

          <section aria-labelledby="garanties-title" className="flex flex-col gap-6">
            <h2 id="garanties-title" className="text-2xl font-semibold text-foreground">
              Ce que MakomSpace garantit
            </h2>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
              {GUARANTEES.map((item) => (
                <li key={item.title} className="flex flex-col gap-2 rounded-2xl bg-muted p-5">
                  <item.icon aria-hidden="true" className="size-5 text-primary" />
                  <h3 className="font-sans text-sm font-semibold text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-8 text-center">
            <h2 className="text-lg font-semibold text-foreground">Encore une question ?</h2>
            <p className="text-sm text-muted-foreground">
              Paiement, annulation, factures, versements : les réponses sont dans la FAQ.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink href="/faq">Questions fréquentes</ButtonLink>
              <ButtonLink href="/contact" variant="outline">
                Nous contacter
              </ButtonLink>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
