import { zonedTimeToUtc } from "@/server/domains/bookings/timezone";

/**
 * Accounting calendar of the platform: Europe/Paris. A payment captured on
 * 1 August at 00:30 in Paris belongs to August, even though it is still
 * 31 July in UTC — the commission months and the invoice years follow the
 * French calendar, not UTC.
 */
export const ACCOUNTING_TIMEZONE = "Europe/Paris";

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

export function zonedParts(date: Date, timeZone: string = ACCOUNTING_TIMEZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

export function parisYear(date: Date): number {
  return zonedParts(date).year;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** "YYYY-MM" → [first instant of the month, first instant of the next) in
 * Paris time, as UTC instants. */
export function parisMonthPeriod(month: string): { periodStart: Date; periodEnd: Date } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  const nextYear = monthIndex === 12 ? year + 1 : year;
  const nextMonth = monthIndex === 12 ? 1 : monthIndex + 1;
  return {
    periodStart: zonedTimeToUtc(`${year}-${pad2(monthIndex)}-01`, "00:00", ACCOUNTING_TIMEZONE),
    periodEnd: zonedTimeToUtc(`${nextYear}-${pad2(nextMonth)}-01`, "00:00", ACCOUNTING_TIMEZONE),
  };
}

/** The Paris calendar month before the one `now` falls in, as "YYYY-MM". */
export function previousParisMonth(now: Date): string {
  const { year, month } = zonedParts(now);
  return month === 1 ? `${year - 1}-12` : `${year}-${pad2(month - 1)}`;
}

/** The Paris calendar month a period starts in, as "YYYY-MM". */
export function parisMonthOf(date: Date): string {
  const { year, month } = zonedParts(date);
  return `${year}-${pad2(month)}`;
}

export function formatParisMonth(date: Date): string {
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: ACCOUNTING_TIMEZONE });
}
