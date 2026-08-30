import { describe, expect, it } from "vitest";
import { isValidTimeZone, weekdayOf, zonedTimeToUtc } from "@/server/domains/bookings/timezone";

const iso = (d: Date) => d.toISOString();

describe("zonedTimeToUtc", () => {
  it("applies winter time in Europe/Paris (UTC+1)", () => {
    expect(iso(zonedTimeToUtc("2030-01-15", "09:00", "Europe/Paris"))).toBe(
      "2030-01-15T08:00:00.000Z"
    );
  });

  it("applies summer time in Europe/Paris (UTC+2)", () => {
    expect(iso(zonedTimeToUtc("2030-07-15", "09:00", "Europe/Paris"))).toBe(
      "2030-07-15T07:00:00.000Z"
    );
  });

  it("stays correct on the day the clocks go forward", () => {
    // 2030-03-31: Europe/Paris jumps 02:00 -> 03:00. A 09:00 opening that
    // day is already on summer time, so UTC+2.
    expect(iso(zonedTimeToUtc("2030-03-31", "09:00", "Europe/Paris"))).toBe(
      "2030-03-31T07:00:00.000Z"
    );
  });

  it("stays correct on the day the clocks go back", () => {
    // 2030-10-27: Europe/Paris falls back 03:00 -> 02:00. A 09:00 opening
    // that day is on winter time, so UTC+1.
    expect(iso(zonedTimeToUtc("2030-10-27", "09:00", "Europe/Paris"))).toBe(
      "2030-10-27T08:00:00.000Z"
    );
  });

  it("honours a zone that is not Europe/Paris", () => {
    // La Réunion is UTC+4 all year — no DST.
    expect(iso(zonedTimeToUtc("2030-01-15", "09:00", "Indian/Reunion"))).toBe(
      "2030-01-15T05:00:00.000Z"
    );
    expect(iso(zonedTimeToUtc("2030-07-15", "09:00", "Indian/Reunion"))).toBe(
      "2030-07-15T05:00:00.000Z"
    );
  });

  it("handles a zone west of UTC", () => {
    // Martinique is UTC-4 all year.
    expect(iso(zonedTimeToUtc("2030-07-15", "09:00", "America/Martinique"))).toBe(
      "2030-07-15T13:00:00.000Z"
    );
  });

  it("treats UTC as a no-op", () => {
    expect(iso(zonedTimeToUtc("2030-07-15", "09:00", "UTC"))).toBe("2030-07-15T09:00:00.000Z");
  });

  it("keeps midnight on the right calendar day", () => {
    expect(iso(zonedTimeToUtc("2030-07-15", "00:00", "Europe/Paris"))).toBe(
      "2030-07-14T22:00:00.000Z"
    );
  });
});

describe("weekdayOf", () => {
  it("matches SpaceOpeningHours.weekday (0 = Sunday)", () => {
    expect(weekdayOf("2030-03-03")).toBe(0); // dimanche
    expect(weekdayOf("2030-03-04")).toBe(1); // lundi
    expect(weekdayOf("2030-03-09")).toBe(6); // samedi
  });
});

describe("isValidTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("Indian/Reunion")).toBe(true);
  });

  it("rejects anything the runtime does not know, rather than silently using UTC", () => {
    expect(isValidTimeZone("Europe/Paaris")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("UTC+2")).toBe(false);
  });
});
