# Runbook — Versements aux bailleurs

## Principe
- L'encaissement se fait sur le compte plateforme (autorisation à la demande, capture à l'acceptation). MakomSpace conserve les fonds jusqu'à la fin du séjour + 24 h (fenêtre de litige).
- Les versements sont des `transfers` Stripe vers le compte connecté du bailleur, déclenchés par la tâche planifiée (toutes les 15 min, `/api/internal/expire-bookings`).
- Échéance : lundi 00:00 (hebdomadaire) ou 1er du mois 00:00 (mensuel), Europe/Paris ; exécution à partir de 08:00.
- Lignes : `EARNING` (+) à `endsAt + 24 h`, ou immédiat si annulation ; `CANCELLATION_PENALTY` (−) quand le bailleur annule dans le délai. Un solde négatif est reporté.
- Retenue : litige ouvert (interne ou Stripe) ou remboursement en cours bloque les lignes concernées. Bailleur sans compte prêt : en attente.
- Échec : nouvel essai après 10 min, même clé d'idempotence (`payout:<id>`).

## Contrôles
- Admin → Versements : à venir, versés, échoués.
- Un versement `FAILED` persistant : vérifier le solde Stripe de la plateforme et l'état `payouts_enabled` du compte connecté.
- Réconciliation : comparer le total des `Payout` PAID du mois aux transferts Stripe (export CSV bailleur disponible).

## Points juridiques/comptables à valider
- Détention de fonds de tiers (agrément ou statut d'agent de prestataire de paiement ?) : à faire valider par un juriste.
- Traitement comptable/TVA de la commission facturée au bailleur en cas d'annulation : expert-comptable.
