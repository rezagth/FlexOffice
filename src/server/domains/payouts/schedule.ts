import { zonedTimeToUtc } from "@/server/domains/bookings/timezone";
import { ACCOUNTING_TIMEZONE, zonedParts } from "@/server/domains/invoicing/paris-time";

export type PayoutFrequencyValue = "WEEKLY" | "MONTHLY";

/** A landlord's earnings become payable this long after the end of the
 * stay: the window in which the client can still report a problem
 * (disputes/raise.ts). */
export const DISPUTE_WINDOW_HOURS = 24;

/** Payouts are created from this hour (Paris) on the boundary day, so the
 * night's last captures and refunds are settled first. */
export const PAYOUT_RUN_HOUR = 8;

const pad2 = (value: number) => String(value).padStart(2, "0");

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** The most recent schedule boundary at or before `now`: Monday 00:00 for a
 * weekly landlord, the 1st at 00:00 for a monthly one, Europe/Paris. */
function boundaryAtOrBefore(frequency: PayoutFrequencyValue, now: Date): Date {
  const { year, month, day } = zonedParts(now);
  if (frequency === "MONTHLY") {
    return zonedTimeToUtc(isoDate(year, month, 1), "00:00", ACCOUNTING_TIMEZONE);
  }
  // The weekday of the Paris calendar date, from its own noon (no zone issue).
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = new Date(Date.UTC(year, month - 1, day - daysSinceMonday, 12));
  return zonedTimeToUtc(
    isoDate(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
    "00:00",
    ACCOUNTING_TIMEZONE
  );
}

function previousBoundary(frequency: PayoutFrequencyValue, boundary: Date): Date {
  // One hour inside the previous period is enough to land in it.
  return boundaryAtOrBefore(frequency, new Date(boundary.getTime() - 3_600_000));
}

/** The payout boundary that is due at `now`: the latest one whose run time
 * (boundary + PAYOUT_RUN_HOUR) has passed. */
export function dueBoundary(frequency: PayoutFrequencyValue, now: Date): Date {
  const latest = boundaryAtOrBefore(frequency, now);
  const runsAt = latest.getTime() + PAYOUT_RUN_HOUR * 3_600_000;
  return now.getTime() >= runsAt ? latest : previousBoundary(frequency, latest);
}

/** The next boundary strictly after `now` — "your next payout is on…". */
export function nextBoundary(frequency: PayoutFrequencyValue, now: Date): Date {
  const latest = boundaryAtOrBefore(frequency, now);
  // 8 days after a Monday, 32 days after the 1st: always inside the next period.
  const probe = new Date(latest.getTime() + (frequency === "WEEKLY" ? 8 : 32) * 86_400_000);
  return boundaryAtOrBefore(frequency, probe);
}

/** When an earning on a booking that ended at `endsAt` can be paid out. */
export function earningEligibleAt(endsAt: Date): Date {
  return new Date(endsAt.getTime() + DISPUTE_WINDOW_HOURS * 3_600_000);
}
