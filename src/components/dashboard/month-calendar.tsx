import Link from "next/link";
import { clsx } from "clsx";
import type { MonthDayStatus } from "@/server/domains/bookings/availability";

const WEEKDAY_HEADERS = ["L", "M", "M", "J", "V", "S", "D"];

const STATUS_STYLES: Record<MonthDayStatus, string> = {
  AVAILABLE: "bg-[color-mix(in_srgb,var(--color-success,#1F7A4D)_12%,transparent)] text-foreground",
  PARTIAL: "bg-[color-mix(in_srgb,#A5680A_16%,transparent)] text-foreground",
  BOOKED: "bg-muted text-muted-foreground",
  CLOSED: "bg-transparent text-muted-foreground/60",
};

const STATUS_LABELS: Record<MonthDayStatus, string> = {
  AVAILABLE: "Disponible",
  PARTIAL: "Partiellement réservé",
  BOOKED: "Complet",
  CLOSED: "Fermé",
};

function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function MonthCalendar({
  yearMonth,
  days,
  hrefForMonth,
}: {
  yearMonth: string;
  days: Record<string, MonthDayStatus>;
  /** Builds the link for another month — the caller owns the URL shape
   * (which space is selected, etc.). Server component, so passing a
   * function down is fine. */
  hrefForMonth: (yearMonth: string) => string;
}) {
  const [year, month] = yearMonth.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  // Monday-first grid: getUTCDay() is 0=Sunday, so shift it.
  const leadingBlanks = (firstOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const monthLabel = firstOfMonth.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link
          href={hrefForMonth(shiftMonth(yearMonth, -1))}
          className="rounded-lg px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Mois précédent
        </Link>
        <p className="text-sm font-medium capitalize">{monthLabel}</p>
        <Link
          href={hrefForMonth(shiftMonth(yearMonth, 1))}
          className="rounded-lg px-3 py-1.5 text-sm hover:bg-muted"
        >
          Mois suivant →
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_HEADERS.map((label, index) => (
          <div key={index} className="pb-1 text-center text-xs text-muted-foreground">
            {label}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const status = days[dateStr] ?? "CLOSED";
          return (
            <div
              key={dateStr}
              title={`${dateStr} — ${STATUS_LABELS[status]}`}
              className={clsx(
                "flex aspect-square flex-col items-center justify-center rounded-lg border border-border text-sm",
                STATUS_STYLES[status]
              )}
            >
              <span>{day}</span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {(Object.keys(STATUS_LABELS) as MonthDayStatus[]).map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={clsx("h-3 w-3 rounded border border-border", STATUS_STYLES[status])}
            />
            {STATUS_LABELS[status]}
          </span>
        ))}
      </div>
    </div>
  );
}
