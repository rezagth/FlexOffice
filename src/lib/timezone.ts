/** Isomorphic timezone helpers — safe to import from a Client Component.
 * The server-side slot maths lives in server/domains/bookings/timezone.ts. */

export const DEFAULT_TIMEZONE = "Europe/Paris";

/** Whether the runtime recognises an IANA zone name, so a bad value is
 * rejected at the edge instead of silently resolving to UTC. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Zones offered in the space form. Any valid IANA zone is accepted by the
 * API — this list only covers where French partners actually operate, so
 * the common case is one click rather than a search. */
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "Europe/Paris", label: "France métropolitaine (Paris)" },
  { value: "Europe/Brussels", label: "Belgique (Bruxelles)" },
  { value: "Europe/Luxembourg", label: "Luxembourg" },
  { value: "Europe/Zurich", label: "Suisse (Zurich)" },
  { value: "Europe/Lisbon", label: "Portugal (Lisbonne)" },
  { value: "Europe/London", label: "Royaume-Uni (Londres)" },
  { value: "America/Guadeloupe", label: "Guadeloupe" },
  { value: "America/Martinique", label: "Martinique" },
  { value: "America/Cayenne", label: "Guyane" },
  { value: "Indian/Reunion", label: "La Réunion" },
  { value: "Indian/Mayotte", label: "Mayotte" },
  { value: "Pacific/Noumea", label: "Nouvelle-Calédonie" },
];
