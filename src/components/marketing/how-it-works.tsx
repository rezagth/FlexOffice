const CLIENT_STEPS = [
  { title: "Recherchez", description: "Filtrez par ville et trouvez un espace disponible." },
  { title: "Réservez", description: "Choisissez votre créneau et payez en ligne en toute sécurité." },
  { title: "Recevez vos clients", description: "Accédez à l'espace avec les instructions envoyées par email." },
];

const PARTNER_STEPS = [
  { title: "Publiez", description: "Décrivez votre espace, ses équipements et son prix." },
  { title: "Recevez des demandes", description: "Acceptez ou refusez chaque demande de réservation." },
  { title: "Soyez payé", description: "Le paiement est reversé automatiquement, commission déduite." },
];

function StepList({ steps }: { steps: { title: string; description: string }[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-4">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          >
            {index + 1}
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
        <h2 className="text-2xl font-semibold text-foreground">Comment ça marche</h2>
        <div className="mt-8 grid grid-cols-1 gap-10 sm:grid-cols-2">
          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Pour les clients
            </p>
            <StepList steps={CLIENT_STEPS} />
          </div>
          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Pour les entreprises partenaires
            </p>
            <StepList steps={PARTNER_STEPS} />
          </div>
        </div>
      </div>
    </section>
  );
}
