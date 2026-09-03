import { beforeEach, describe, expect, it, vi } from "vitest";

const spaceFindUnique = vi.fn();
const hoursFindMany = vi.fn();
const closuresFindMany = vi.fn();
const bookingsFindMany = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    space: { findUnique: spaceFindUnique },
    spaceOpeningHours: { findMany: hoursFindMany },
    spaceClosure: { findMany: closuresFindMany },
    booking: { findMany: bookingsFindMany },
  },
}));

const { computeDaySlots } = await import("@/server/domains/bookings/availability");

const SPACE = { id: "space-1", halfDayPriceCents: 9000, dayPriceCents: 15000, timezone: "Europe/Paris" };
// 2030-03-04 is a Monday.
const MONDAY = "2030-03-04";

beforeEach(() => {
  spaceFindUnique.mockReset().mockResolvedValue(SPACE);
  hoursFindMany.mockReset().mockResolvedValue([{ weekday: 1, opensAt: "09:00", closesAt: "18:00" }]);
  closuresFindMany.mockReset().mockResolvedValue([]);
  bookingsFindMany.mockReset().mockResolvedValue([]);
});

describe("computeDaySlots", () => {
  it("returns morning, afternoon and full day when the space is open across midday", async () => {
    const slots = await computeDaySlots(SPACE.id, MONDAY);
    expect(slots?.morning?.available).toBe(true);
    expect(slots?.afternoon?.available).toBe(true);
    expect(slots?.fullDay.available).toBe(true);
    expect(slots?.morning?.priceCents).toBe(9000);
    expect(slots?.fullDay.priceCents).toBe(15000);
  });

  it("returns null when the space has no opening hours for that weekday", async () => {
    hoursFindMany.mockResolvedValue([]);
    expect(await computeDaySlots(SPACE.id, MONDAY)).toBeNull();
  });

  it("has no afternoon slot when the space closes at or before 13:00", async () => {
    hoursFindMany.mockResolvedValue([{ weekday: 1, opensAt: "09:00", closesAt: "12:00" }]);
    const slots = await computeDaySlots(SPACE.id, MONDAY);
    expect(slots?.afternoon).toBeNull();
    expect(slots?.morning).not.toBeNull();
  });

  it("ends the morning at closing time when the space closes before 13:00", async () => {
    hoursFindMany.mockResolvedValue([{ weekday: 1, opensAt: "09:00", closesAt: "12:00" }]);
    const slots = await computeDaySlots(SPACE.id, MONDAY);
    // March 4th is CET (UTC+1): 12:00 Paris is 11:00 UTC.
    expect(slots?.morning?.endsAt.toISOString()).toBe("2030-03-04T11:00:00.000Z");
    expect(slots?.fullDay.endsAt.toISOString()).toBe("2030-03-04T11:00:00.000Z");
  });

  it("has no morning slot when the space opens at or after 13:00", async () => {
    hoursFindMany.mockResolvedValue([{ weekday: 1, opensAt: "14:00", closesAt: "19:00" }]);
    const slots = await computeDaySlots(SPACE.id, MONDAY);
    expect(slots?.morning).toBeNull();
    expect(slots?.afternoon).not.toBeNull();
  });

  it("starts the afternoon at opening time when the space opens after 13:00", async () => {
    hoursFindMany.mockResolvedValue([{ weekday: 1, opensAt: "14:00", closesAt: "19:00" }]);
    const slots = await computeDaySlots(SPACE.id, MONDAY);
    expect(slots?.afternoon?.startsAt.toISOString()).toBe("2030-03-04T13:00:00.000Z");
  });

  it("converts opening hours from Europe/Paris wall clock to UTC instants", async () => {
    const slots = await computeDaySlots(SPACE.id, MONDAY);
    // 09:00 / 13:00 / 18:00 Paris in CET (UTC+1).
    expect(slots?.morning?.startsAt.toISOString()).toBe("2030-03-04T08:00:00.000Z");
    expect(slots?.morning?.endsAt.toISOString()).toBe("2030-03-04T12:00:00.000Z");
    expect(slots?.fullDay.endsAt.toISOString()).toBe("2030-03-04T17:00:00.000Z");
  });

  it("applies summer time (CEST) rather than a fixed offset", async () => {
    // 2030-06-03 is a Monday in CEST (UTC+2).
    const slots = await computeDaySlots(SPACE.id, "2030-06-03");
    expect(slots?.morning?.startsAt.toISOString()).toBe("2030-06-03T07:00:00.000Z");
  });

  it("blocks a whole slot on a partially overlapping closure — no pro-rating", async () => {
    closuresFindMany.mockResolvedValue([
      {
        startsAt: new Date("2030-03-04T09:00:00Z"),
        endsAt: new Date("2030-03-04T09:30:00Z"),
      },
    ]);
    const slots = await computeDaySlots(SPACE.id, MONDAY);
    expect(slots?.morning?.available).toBe(false);
    expect(slots?.fullDay.available).toBe(false);
  });

  it("marks the full day unavailable when only the afternoon is booked", async () => {
    bookingsFindMany.mockResolvedValue([
      {
        startsAt: new Date("2030-03-04T13:00:00Z"),
        endsAt: new Date("2030-03-04T17:00:00Z"),
      },
    ]);
    const slots = await computeDaySlots(SPACE.id, MONDAY);
    expect(slots?.afternoon?.available).toBe(false);
    expect(slots?.fullDay.available).toBe(false);
    expect(slots?.morning?.available).toBe(true);
  });

  it("only queries bookings that block a slot (PENDING or CONFIRMED)", async () => {
    await computeDaySlots(SPACE.id, MONDAY);
    expect(bookingsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ["PENDING", "CONFIRMED"] } }),
      })
    );
  });
});
