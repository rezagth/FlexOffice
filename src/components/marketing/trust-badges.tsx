import { CalendarX, Lock, LifeBuoy, ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";

/**
 * Two of the four descriptions in the supplied mockup made specific
 * operational claims this repo has no basis for ("inspection en 50 points
 * de contrôle", "conciergerie disponible 24h/24") — neither figure appears
 * in officeflex-context. Reworded to what the product actually does
 * (SIRET/email/address verification, a support team, no 24/7 guarantee)
 * rather than copying an unverified claim into production copy.
 */
const GUARANTEES: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  badge: "dark" | "accent";
}[] = [
  {
    icon: Lock,
    title: "Paiement sécurisé",
    description: "Paiement traité par un prestataire certifié PCI-DSS, sans stockage bancaire.",
    badge: "dark",
  },
  {
    icon: ShieldCheck,
    title: "Espaces vérifiés",
    description: "Chaque espace est vérifié (SIRET, e-mail professionnel, adresse) avant publication.",
    badge: "accent",
  },
  {
    icon: LifeBuoy,
    title: "Support 7j/7",
    description: "Une équipe disponible pour vous accompagner en cas de question ou de litige.",
    badge: "dark",
  },
  {
    icon: CalendarX,
    title: "Sans abonnement",
    description: "Réservez à la demande, sans engagement ni abonnement long terme.",
    badge: "accent",
  },
];

export function TrustBadges() {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto max-w-6xl px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold text-foreground">La garantie OfficeFlex</h2>
        <p className="mt-2 text-muted-foreground">
          Réservez en toute sérénité grâce à nos standards de qualité élevés.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {GUARANTEES.map((item) => (
            <div
              key={item.title}
              className="flex flex-col items-center gap-3 rounded-2xl border border-border p-6 text-center"
            >
              <span
                aria-hidden="true"
                className={`flex h-12 w-12 items-center justify-center rounded-full ${
                  item.badge === "dark"
                    ? "bg-foreground text-background"
                    : "bg-accent text-accent-foreground"
                }`}
              >
                <item.icon className="size-5" />
              </span>
              <p className="font-medium text-foreground">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
