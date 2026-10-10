import { describe, expect, it } from "vitest";
import { formatBookingDate, formatSlotHours } from "@/components/booking/booking-funnel";

describe("booking recap formatting (UX-17)", () => {
  it("shows the day in French, never as ISO", () => {
    expect(formatBookingDate("2030-03-04")).toBe("lundi 4 mars 2030");
  });

  it("does not shift the calendar day whatever the runtime time zone", () => {
    expect(formatBookingDate("2031-01-01")).toBe("mercredi 1 janvier 2031");
  });

  it("shows the slot hours in the space's time zone", () => {
    // 08:00Z–12:00Z is 9:00–13:00 in Paris in winter.
    const slot = { startsAt: "2030-03-04T08:00:00.000Z", endsAt: "2030-03-04T12:00:00.000Z" };
    expect(formatSlotHours(slot, "Europe/Paris")).toBe("9 h 00 – 13 h 00");
    expect(formatSlotHours(slot, "Indian/Reunion")).toBe("12 h 00 – 16 h 00");
  });

  it("returns null when the slot carries no times", () => {
    expect(formatSlotHours({}, "Europe/Paris")).toBeNull();
    expect(formatSlotHours({ startsAt: "nope", endsAt: "nope" }, "Europe/Paris")).toBeNull();
  });
});
