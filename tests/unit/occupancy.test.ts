import { beforeEach, describe, expect, it, vi } from "vitest";

const spaceFindMany = vi.fn();
const hoursFindMany = vi.fn();
const closuresFindMany = vi.fn();
const bookingsFindMany = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    space: { findMany: spaceFindMany },
    spaceOpeningHours: { findMany: hoursFindMany },
    spaceClosure: { findMany: closuresFindMany },
    booking: { findMany: bookingsFindMany },
  },
}));

const { computeOrganizationOccupancy } = await import("@/server/domains/bookings/occupancy");

const SPACE = { id: "space-1", name: "Salle Rivoli", timezone: "Europe/Paris" };
// 2030-03-04 and 2030-03-11 are both Mondays.
const MONDAY_1 = "2030-03-04";
const MONDAY_2 = "2030-03-11";

beforeEach(() => {
  spaceFindMany.mockReset().mockResolvedValue([SPACE]);
  // Open Mondays only, 09:00-18:00 — one morning slot, one afternoon slot.
  hoursFindMany.mockReset().mockResolvedValue([
    { spaceId: SPACE.id, weekday: 1, opensAt: "09:00", closesAt: "18:00" },
  ]);
  closuresFindMany.mockReset().mockResolvedValue([]);
  bookingsFindMany.mockReset().mockResolvedValue([]);
});

describe("computeOrganizationOccupancy", () => {
  it("is 0% when nothing at all is booked over the period (known open slots, zero booked)", async () => {
    const [result] = await computeOrganizationOccupancy("org-1", MONDAY_1, MONDAY_1);

    expect(result.openSlotCount).toBe(2); // morning + afternoon, one Monday.
    expect(result.bookedSlotCount).toBe(0);
    expect(result.occupancyRatePercent).toBe(0);
  });

  it("is 100% when every open slot that day is booked", async () => {
    bookingsFindMany.mockResolvedValue([
      {
        spaceId: SPACE.id,
        startsAt: new Date("2030-03-04T08:00:00Z"), // 09:00 Paris (CET, UTC+1)
        endsAt: new Date("2030-03-04T17:00:00Z"), // 18:00 Paris
      },
    ]);

    const [result] = await computeOrganizationOccupancy("org-1", MONDAY_1, MONDAY_1);

    expect(result.openSlotCount).toBe(2);
    expect(result.bookedSlotCount).toBe(2);
    expect(result.occupancyRatePercent).toBe(100);
  });

  it("matches the exact ratio for a known, partially booked set of slots (only the morning)", async () => {
    bookingsFindMany.mockResolvedValue([
      {
        spaceId: SPACE.id,
        startsAt: new Date("2030-03-04T08:00:00Z"), // 09:00 Paris
        endsAt: new Date("2030-03-04T12:00:00Z"), // 13:00 Paris
      },
    ]);

    const [result] = await computeOrganizationOccupancy("org-1", MONDAY_1, MONDAY_1);

    expect(result.openSlotCount).toBe(2);
    expect(result.bookedSlotCount).toBe(1);
    expect(result.occupancyRatePercent).toBe(50);
  });

  it("aggregates across every open day in the period, not just the first", async () => {
    // Two Mondays in the period: the first fully booked, the second free.
    bookingsFindMany.mockResolvedValue([
      {
        spaceId: SPACE.id,
        startsAt: new Date("2030-03-04T08:00:00Z"),
        endsAt: new Date("2030-03-04T17:00:00Z"),
      },
    ]);

    const [result] = await computeOrganizationOccupancy("org-1", MONDAY_1, MONDAY_2);

    // 4 open slots total (2 Mondays × 2 half-days), 2 booked.
    expect(result.openSlotCount).toBe(4);
    expect(result.bookedSlotCount).toBe(2);
    expect(result.occupancyRatePercent).toBe(50);
  });

  it("does not count closed weekdays toward the open slot total", async () => {
    // The period spans a full week; the space is only ever open on Monday.
    const [result] = await computeOrganizationOccupancy("org-1", MONDAY_1, "2030-03-10");

    expect(result.openSlotCount).toBe(2); // one Monday, not seven days.
  });

  it("reports 0%, not NaN, for a space with no opening hours in the period at all", async () => {
    hoursFindMany.mockResolvedValue([]);

    const [result] = await computeOrganizationOccupancy("org-1", MONDAY_1, MONDAY_1);

    expect(result.openSlotCount).toBe(0);
    expect(result.occupancyRatePercent).toBe(0);
  });

  it("returns an empty list for an organization with no published spaces", async () => {
    spaceFindMany.mockResolvedValue([]);

    const result = await computeOrganizationOccupancy("org-1", MONDAY_1, MONDAY_1);

    expect(result).toEqual([]);
    expect(hoursFindMany).not.toHaveBeenCalled();
  });
});
