const BEFORE = [
  "Un café bruyant, sans intimité pour parler affaires",
  "Un hall d'hôtel impersonnel, coûteux à la journée",
  "Aucune garantie de wifi, d'écran ou de salle disponible",
];

const AFTER = [
  "Une vraie salle de réunion, équipée et professionnelle",
  "Réservée à la demi-journée, sans engagement ni abonnement",
  "Wifi, écran, caméra : équipements vérifiés avant réservation",
];

export function ProblemSection() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-semibold text-foreground">
          Vos rendez-vous méritent mieux qu&apos;un café
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          La crédibilité du lieu où vous recevez vos clients compte. OfficeFlex vous
          donne accès à de vrais bureaux professionnels, à la demande.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-border p-6">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Avant
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
              {BEFORE.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true" className="text-muted-foreground">
                    –
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
            <p className="text-sm font-medium uppercase tracking-wide text-primary">
              Avec OfficeFlex
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-foreground">
              {AFTER.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true" className="text-primary">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
