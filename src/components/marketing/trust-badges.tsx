const BADGES = [
  { title: "Entreprises vérifiées", description: "SIRET et email professionnel contrôlés avant publication." },
  { title: "Paiement sécurisé", description: "Paiement en ligne géré par un prestataire certifié PCI-DSS." },
  { title: "Espaces contrôlés", description: "Chaque annonce est modérée avant mise en ligne." },
  { title: "Support dédié", description: "Une équipe disponible en cas de litige ou de question." },
];

export function TrustBadges() {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-semibold text-foreground">Confiance</h2>
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {BADGES.map((badge) => (
            <div key={badge.title} className="rounded-2xl border border-border p-5">
              <p className="font-medium text-foreground">{badge.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{badge.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
