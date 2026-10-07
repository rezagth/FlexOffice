/** Opening hours of a space as shown on its public page (UX-16). */

export type OpeningHoursRow = { weekday: number; opensAt: string; closesAt: string };

/** Monday first, the French convention; values are SpaceOpeningHours
 * weekdays (0 = Sunday). */
const WEEK = [
  { weekday: 1, label: "Lundi" },
  { weekday: 2, label: "Mardi" },
  { weekday: 3, label: "Mercredi" },
  { weekday: 4, label: "Jeudi" },
  { weekday: 5, label: "Vendredi" },
  { weekday: 6, label: "Samedi" },
  { weekday: 0, label: "Dimanche" },
];

function formatTime(value: string): string {
  const [hours, minutes] = value.split(":");
  return minutes && minutes !== "00" ? `${Number(hours)} h ${minutes}` : `${Number(hours)} h`;
}

/** One line per day of the week, Monday to Sunday: "9 h – 19 h", several
 * ranges joined by a comma, or "Fermé". */
export function weeklyOpeningHours(rows: OpeningHoursRow[]): { day: string; hours: string }[] {
  return WEEK.map(({ weekday, label }) => {
    const ranges = rows
      .filter((row) => row.weekday === weekday)
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt))
      .map((row) => `${formatTime(row.opensAt)} – ${formatTime(row.closesAt)}`);
    return { day: label, hours: ranges.length ? ranges.join(", ") : "Fermé" };
  });
}

/** schema.org `openingHoursSpecification` entries for structured data. */
export function openingHoursSpecification(rows: OpeningHoursRow[]) {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return rows.map((row) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: `https://schema.org/${names[row.weekday]}`,
    opens: row.opensAt,
    closes: row.closesAt,
  }));
}
