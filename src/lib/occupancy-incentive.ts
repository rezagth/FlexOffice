import { formatCents } from "@/lib/format";

/**
 * The partner dashboard's incitative nudge (brief §7.3: "Votre salle est
 * disponible 70 % du temps — potentiel supplémentaire : +600 €/mois").
 * Not a fabricated number: the projection is the partner's own real
 * revenue for the period, scaled by their own real idle-time ratio — if
 * `occupancyPercent`% of open slots earned `currentPeriodRevenueCents`,
 * being fully booked would earn `currentPeriodRevenueCents / occupancyPercent
 * * 100`; the potential is that projection minus what was actually earned.
 *
 * Returns `null` once occupancy is already reasonably healthy (>= 50%) —
 * the nudge is for a partner who could clearly be earning more, not a
 * running commentary on every dashboard visit.
 */
export function occupancyIncentiveMessage(
  occupancyPercent: number,
  currentPeriodRevenueCents: number
): string | null {
  if (occupancyPercent >= 50) return null;

  const idlePercent = 100 - occupancyPercent;

  if (occupancyPercent <= 0 || currentPeriodRevenueCents <= 0) {
    return `Vos espaces sont disponibles ${idlePercent} % du temps ce mois-ci — publier vos disponibilités les rend plus visibles pour les clients qui cherchent un espace dès maintenant.`;
  }

  const potentialAdditionalCents = Math.round(
    (currentPeriodRevenueCents * idlePercent) / occupancyPercent
  );

  return `Vos espaces sont disponibles ${idlePercent} % du temps ce mois-ci — potentiel supplémentaire estimé : ${formatCents(potentialAdditionalCents)}/mois si vous étiez complet.`;
}
