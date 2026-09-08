import { prisma } from "@/server/db/prisma";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { weekdayOf } from "./timezone";
import { daySlotsForDay, statusFromSlots } from "./availability";

export type SpaceOccupancy = {
  spaceId: string;
  spaceName: string;
  /** Half-day slots (morning/afternoon) that were actually open during the
   * period — a day the space is closed contributes none, so a space that
   * simply isn't open very often isn't penalized for days it was never
   * bookable in the first place. */
  openSlotCount: number;
  bookedSlotCount: number;
  /** 0-100, rounded. 0 when the space had no open slot at all in the
   * period (nothing to divide by), not NaN. */
  occupancyRatePercent: number;
};

/**
 * Per-space occupancy rate for every PUBLISHED space of `organizationId`,
 * over the inclusive [fromDateStr, toDateStr] period ("YYYY-MM-DD").
 * "Occupied" means the same thing computeDaySlots() already decides for a
 * single space/day — a half-day slot blocked by a closure or a
 * PENDING/CONFIRMED booking — via the same daySlotsForDay()/
 * statusFromSlots() functions, not a second, possibly-diverging
 * definition of availability.
 *
 * Unlike computeDaySlots()/summarizeMonth() (one DB round trip per day,
 * "accepted N+1 for MVP scale" — see availability.ts), this fetches
 * opening hours, closures and bookings ONCE for every space in the
 * organization — 3 queries total, not 3 × days × spaces — since a
 * partner's dashboard can have several spaces and a whole month's period,
 * and multiplying the existing per-day N+1 by the number of spaces would
 * make a known, accepted tradeoff into a much worse one. The per-day
 * classification itself still runs in a loop, entirely in memory.
 */
export async function computeOrganizationOccupancy(
  organizationId: string,
  fromDateStr: string,
  toDateStr: string
): Promise<SpaceOccupancy[]> {
  const spaces = await prisma.space.findMany({
    where: { organizationId, status: "PUBLISHED" },
    select: { id: true, name: true, timezone: true },
  });
  if (spaces.length === 0) return [];

  const spaceIds = spaces.map((s) => s.id);
  // Loose UTC bounds for the bulk fetch below — not the exact per-space,
  // per-timezone day boundaries (those are computed per day inside the
  // loop, exactly like computeDaySlots() does). Being up to a day wider
  // than strictly necessary only means a few extra candidate rows loaded
  // into memory, never an incorrect classification.
  const periodStart = new Date(`${fromDateStr}T00:00:00Z`);
  const periodEnd = new Date(`${toDateStr}T23:59:59Z`);

  const [openingHours, closures, bookings] = await Promise.all([
    prisma.spaceOpeningHours.findMany({ where: { spaceId: { in: spaceIds } } }),
    prisma.spaceClosure.findMany({
      where: { spaceId: { in: spaceIds }, startsAt: { lt: periodEnd }, endsAt: { gt: periodStart } },
    }),
    prisma.booking.findMany({
      where: {
        spaceId: { in: spaceIds },
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { lt: periodEnd },
        endsAt: { gt: periodStart },
      },
    }),
  ]);

  const dateStrings = enumerateDateStrings(fromDateStr, toDateStr);

  return spaces.map((space) => {
    const timeZone = space.timezone || DEFAULT_TIMEZONE;
    const spaceClosures = closures.filter((c) => c.spaceId === space.id);
    const spaceBookings = bookings.filter((b) => b.spaceId === space.id);
    const hoursByWeekday = new Map<number, { opensAt: string; closesAt: string }[]>();
    for (const row of openingHours) {
      if (row.spaceId !== space.id) continue;
      const forWeekday = hoursByWeekday.get(row.weekday) ?? [];
      forWeekday.push(row);
      hoursByWeekday.set(row.weekday, forWeekday);
    }

    let openSlotCount = 0;
    let bookedSlotCount = 0;

    for (const dateStr of dateStrings) {
      const hoursForDay = hoursByWeekday.get(weekdayOf(dateStr)) ?? [];
      // Prices are irrelevant to occupancy — the space's real prices
      // aren't loaded in this bulk fetch, so pass 0 rather than fetching
      // them just to discard the result.
      const slots = daySlotsForDay(dateStr, hoursForDay, spaceClosures, spaceBookings, timeZone, 0, 0);
      if (!slots) continue; // CLOSED that weekday — contributes nothing.

      const status = statusFromSlots(slots);
      if (slots.morning) {
        openSlotCount += 1;
        if (!slots.morning.available) bookedSlotCount += 1;
      }
      if (slots.afternoon) {
        openSlotCount += 1;
        if (!slots.afternoon.available) bookedSlotCount += 1;
      }
      // A day with neither a morning nor an afternoon slot (open exactly
      // at/after 13:00 to exactly at/before 13:00 — a degenerate opening
      // hours row) still has a full day: fall back to it so such a day
      // isn't silently dropped from the denominator.
      if (!slots.morning && !slots.afternoon) {
        openSlotCount += 1;
        if (status === "BOOKED") bookedSlotCount += 1;
      }
    }

    const occupancyRatePercent =
      openSlotCount === 0 ? 0 : Math.round((bookedSlotCount / openSlotCount) * 100);

    return { spaceId: space.id, spaceName: space.name, openSlotCount, bookedSlotCount, occupancyRatePercent };
  });
}

function enumerateDateStrings(fromDateStr: string, toDateStr: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${fromDateStr}T00:00:00Z`);
  const end = new Date(`${toDateStr}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
