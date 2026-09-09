import { Building2, CalendarCheck, Coins, Search, ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";

type Step = { title: string; description: string; icon: ComponentType<{ className?: string }> };

const CLIENT_STEPS: Step[] = [
  {
    title: "Recherchez",
    description: "Filtrez par ville, date et capacité nécessaire.",
    icon: Search,
  },
  {
    title: "Réservez",
    description: "Choisissez votre créneau et payez en ligne en toute sécurité.",
    icon: CalendarCheck,
  },
  {
    title: "Travaillez",
    description: "Accédez à l'espace avec les instructions envoyées par email.",
    icon: Building2,
  },
];

const PARTNER_STEPS: Step[] = [
  {
    title: "Listez vos bureaux libres",
    description: "Décrivez votre espace, ses équipements et son prix.",
    icon: Building2,
  },
  {
    title: "Validation OfficeFlex",
    description: "Nous vérifions chaque espace avant publication.",
    icon: ShieldCheck,
  },
  {
    title: "Générez des revenus",
    description: "Le paiement est reversé automatiquement, commission déduite.",
    icon: Coins,
  },
];

function StepList({ steps, iconClassName }: { steps: Step[]; iconClassName: string }) {
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((step) => (
        <li key={step.title} className="flex gap-4">
          <span
            aria-hidden="true"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconClassName}`}
          >
            <step.icon className="size-5" />
          </span>
          <div>
            <p className="font-medium text-foreground">{step.title}</p>
            <p className="text-sm text-muted-foreground">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function HowItWorks() {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-semibold text-foreground">Comment ça marche ?</h2>
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-2xl p-6">
            <p className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              <span
                aria-hidden="true"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
              >
                1
              </span>
              Pour les clients
            </p>
            <StepList steps={CLIENT_STEPS} iconClassName="bg-foreground text-background" />
          </div>
          {/* Neutral highlighted card — bg-muted — to set this column apart,
           * matching the mockup's distinct (but not brand-tinted) background
           * for "Pour les Entreprises". */}
          <div className="rounded-2xl bg-muted p-6">
            <p className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-foreground">
              <span
                aria-hidden="true"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
              >
                2
              </span>
              Pour les entreprises
            </p>
            <StepList steps={PARTNER_STEPS} iconClassName="bg-accent text-accent-foreground" />
          </div>
        </div>
      </div>
    </section>
  );
}
