import { prisma } from "@/server/db/prisma";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { weekdayOf, zonedTimeToUtc } from "./timezone";

const MIDDAY = "13:00";

/**
 * Applies `Space.discountPercent` to a price, rounding down to the nearest
 * cent so a discount never charges more than advertised. The percentage
 * itself is bounded 0-100 by a DB CHECK (see migration 20260905130000), so
 * this never has to defend against an out-of-range value — only against it
 * being absent.
 */
function applyDiscount(priceCents: number, discountPercent: number | null): number {
  if (!discountPercent) return priceCents;
  return Math.floor((priceCents * (100 - discountPercent)) / 100);
}

export type SlotKind = "MORNING" | "AFTERNOON" | "FULL_DAY";

export type DaySlot = {
  available: boolean;
  priceCents: number;
  startsAt: Date;
  endsAt: Date;
};

export type DaySlots = {
  /** Half-day slots are `null` when the space's opening hours that day
   * don't reach across 13:00 on that side (e.g. closesAt <= "13:00"). */
  morning: DaySlot | null;
  afternoon: DaySlot | null;
  fullDay: DaySlot;
};

export type OpeningHoursRow = { opensAt: string; closesAt: string };
export type OverlapWindow = { startsAt: Date; endsAt: Date };

/**
 * The MVP's whole notion of a bookable slot: for a given calendar day, a
 * half-day is either the morning (opensAt→13:00) or the afternoon
 * (13:00→closesAt), and a full day is opensAt→closesAt. This is the only
 * place that decides what "available" means — computeDaySlots() (a single
 * space/day, fetching from the DB) and computeOrganizationOccupancy() (a
 * whole organization/period, against data it already fetched in bulk —
 * see occupancy.ts) both call this pure function rather than each
 * re-deriving the rule.
 *
 * Returns `null` when `hoursForDay` is empty — the space has no opening
 * hours configured for that weekday at all (simply closed that day).
 *
 * PHASE 5 NOTE — multiple slots per weekday (e.g. 09:00-12:00 AND
 * 14:00-18:00) are now representable and editable (see
 * `opening-hours.ts`/the space form), but this booking-availability engine
 * still is not: rebuilding it to treat a lunch gap as actually closed is
 * booking-engine work, explicitly out of this phase's scope. Until then, a
 * weekday with several slots is treated as one continuous span from the
 * EARLIEST open to the LATEST close — exactly today's single-slot behavior
 * when there is only one row, and a documented over-approximation (the gap
 * between slots reads as bookable) when there are several.
 */
export function daySlotsForDay(
  dateStr: string,
  hoursForDay: OpeningHoursRow[],
  closures: OverlapWindow[],
  bookings: OverlapWindow[],
  timeZone: string,
  halfDayPriceCents: number,
  dayPriceCents: number
): DaySlots | null {
  if (hoursForDay.length === 0) return null;

  // Zero-padded "HH:mm" strings compare lexicographically in time order.
  const opensAt = hoursForDay.reduce((earliest, h) => (h.opensAt < earliest ? h.opensAt : earliest), hoursForDay[0].opensAt);
  const closesAt = hoursForDay.reduce((latest, h) => (h.closesAt > latest ? h.closesAt : latest), hoursForDay[0].closesAt);

  const dayStart = zonedTimeToUtc(dateStr, opensAt, timeZone);
  const dayEnd = zonedTimeToUtc(dateStr, closesAt, timeZone);
  const middayInstant = zonedTimeToUtc(dateStr, MIDDAY, timeZone);

  const hasMorning = opensAt < MIDDAY;
  const hasAfternoon = closesAt > MIDDAY;

  // Partial overlap blocks the whole slot — no pro-rating.
  const isBlocked = (start: Date, end: Date) =>
    closures.some((c) => c.startsAt < end && c.endsAt > start) ||
    bookings.some((b) => b.startsAt < end && b.endsAt > start);

  // Clamp each half-day to the actual opening hours: a space closing at
  // 12:00 must not offer a morning slot running to 13:00, and one opening
  // at 14:00 must not offer an afternoon starting at 13:00.
  const morningEnd = middayInstant < dayEnd ? middayInstant : dayEnd;
  const afternoonStart = middayInstant > dayStart ? middayInstant : dayStart;

  const morning: DaySlot | null = hasMorning
    ? {
        available: !isBlocked(dayStart, morningEnd),
        priceCents: halfDayPriceCents,
        startsAt: dayStart,
        endsAt: morningEnd,
      }
    : null;

  const afternoon: DaySlot | null = hasAfternoon
    ? {
        available: !isBlocked(afternoonStart, dayEnd),
        priceCents: halfDayPriceCents,
        startsAt: afternoonStart,
        endsAt: dayEnd,
      }
    : null;

  const fullDay: DaySlot = {
    available: !isBlocked(dayStart, dayEnd),
    priceCents: dayPriceCents,
    startsAt: dayStart,
    endsAt: dayEnd,
  };

  return { morning, afternoon, fullDay };
}

export async function computeDaySlots(spaceId: string, dateStr: string): Promise<DaySlots | null> {
  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!space) return null;

  const weekday = weekdayOf(dateStr);
  const rows = await prisma.spaceOpeningHours.findMany({
    where: { spaceId, weekday },
    orderBy: { opensAt: "asc" },
  });
  if (rows.length === 0) return null;

  const timeZone = space.timezone || DEFAULT_TIMEZONE;
  const dayStart = zonedTimeToUtc(dateStr, rows[0].opensAt, timeZone);
  const dayEnd = zonedTimeToUtc(dateStr, rows[rows.length - 1].closesAt, timeZone);

  const [closures, bookings] = await Promise.all([
    prisma.spaceClosure.findMany({
      where: { spaceId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
    }),
    prisma.booking.findMany({
      where: {
        spaceId,
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
    }),
  ]);

  const halfDayPriceCents = applyDiscount(space.halfDayPriceCents, space.discountPercent);
  const dayPriceCents = applyDiscount(space.dayPriceCents, space.discountPercent);

  return daySlotsForDay(dateStr, rows, closures, bookings, timeZone, halfDayPriceCents, dayPriceCents);
}

export type MonthDayStatus = "CLOSED" | "AVAILABLE" | "PARTIAL" | "BOOKED";

export function statusFromSlots(slots: DaySlots): MonthDayStatus {
  if (slots.fullDay.available) return "AVAILABLE";
  const halfAvailable = (slots.morning?.available ?? false) || (slots.afternoon?.available ?? false);
  return halfAvailable ? "PARTIAL" : "BOOKED";
}

/**
 * Whether a space has anything at all bookable on `dateStr` — closed that
 * weekday, or fully booked/blocked, is "no"; a space with only a half-day
 * still free is "yes". Used by the public search date filter
 * (list-spaces.ts) so it answers the same question the booking funnel and
 * the partner calendar already answer, via computeDaySlots(), rather than
 * re-deriving overlap logic against opening hours/closures/bookings itself.
 */
export async function isSpaceAvailableOnDate(spaceId: string, dateStr: string): Promise<boolean> {
  const slots = await computeDaySlots(spaceId, dateStr);
  return slots !== null && statusFromSlots(slots) !== "BOOKED";
}

/**
 * One status per calendar day of `yearMonth` ("YYYY-MM"), for the partner
 * calendar view. Calls computeDaySlots per day (roughly one DB round trip
 * per day) — accepted N+1 for MVP scale (a handful of partner-facing
 * calendars, not a hot public path); revisit if this becomes a bottleneck.
 */
export async function summarizeMonth(
  spaceId: string,
  yearMonth: string
): Promise<Record<string, MonthDayStatus>> {
  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const result: Record<string, MonthDayStatus> = {};
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const slots = await computeDaySlots(spaceId, dateStr);
    result[dateStr] = slots ? statusFromSlots(slots) : "CLOSED";
  }
  return result;
}
