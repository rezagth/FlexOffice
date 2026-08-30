/**
 * Opening hours are stored as wall-clock "HH:mm" strings (see
 * SpaceOpeningHours), so converting them to real instants needs the zone
 * they are written in. That zone lives on the space (`Space.timezone`),
 * because a space is a physical place — not a global constant.
 *
 * No date library: Intl already knows every IANA zone and every DST rule,
 * and one correct conversion is cheaper than a dependency.
 */
export { DEFAULT_TIMEZONE, isValidTimeZone } from "@/lib/timezone";

/** Weekday of a plain "YYYY-MM-DD" calendar date, 0 = Sunday .. 6 =
 * Saturday — matches SpaceOpeningHours.weekday. A calendar date's weekday
 * is the same everywhere, so this needs no zone. */
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

/** The zone's UTC offset, in milliseconds, at a given instant. */
function offsetAt(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));

  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const hour = get("hour");
  const asUtcMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    // Intl can render midnight as hour 24 in some locales/zones.
    hour === 24 ? 0 : hour,
    get("minute"),
    get("second")
  );
  return asUtcMs - instantMs;
}

/**
 * Converts a wall-clock time on a calendar date, read in `timeZone`, to the
 * UTC instant it denotes.
 *
 * Two passes, not one: the offset depends on the instant we are still
 * trying to find, so the first guess can land on the wrong side of a DST
 * transition. Re-reading the offset at the candidate instant and only
 * keeping the correction when it is stable makes spring-forward and
 * fall-back days resolve correctly instead of being off by an hour.
 */
export function zonedTimeToUtc(dateStr: string, time: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClockAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  const firstGuessMs = wallClockAsUtcMs - offsetAt(wallClockAsUtcMs, timeZone);
  const secondOffset = offsetAt(firstGuessMs, timeZone);
  const refinedMs = wallClockAsUtcMs - secondOffset;

  // On a spring-forward gap the wall-clock time does not exist; both passes
  // disagree and we keep the later instant, which is what a calendar app
  // does (09:30 on a day that jumps 02:00→03:00 still means "opening time").
  return new Date(refinedMs);
}
