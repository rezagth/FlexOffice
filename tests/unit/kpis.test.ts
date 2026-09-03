import { beforeEach, describe, expect, it, vi } from "vitest";

const searchEventCount = vi.fn();
const bookingCount = vi.fn();
const bookingFindMany = vi.fn();

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    searchEvent: { count: searchEventCount },
    booking: { count: bookingCount, findMany: bookingFindMany },
    space: { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@/server/domains/bookings/availability", () => ({
  summarizeMonth: vi.fn(),
}));

const {
  getSearchToBookingConversionRate,
  getAverageResponseTimeHours,
} = await import("@/server/domains/analytics/kpis");

beforeEach(() => {
  searchEventCount.mockReset();
  bookingCount.mockReset();
  bookingFindMany.mockReset();
});

describe("getSearchToBookingConversionRate", () => {
  it("returns null rather than a misleading 0% when there is no search data yet", async () => {
    searchEventCount.mockResolvedValue(0);
    bookingCount.mockResolvedValue(5);
    expect(await getSearchToBookingConversionRate()).toBeNull();
  });

  it("divides this month's bookings by this month's searches", async () => {
    searchEventCount.mockResolvedValue(100);
    bookingCount.mockResolvedValue(8);
    expect(await getSearchToBookingConversionRate()).toBeCloseTo(0.08);
  });
});

describe("getAverageResponseTimeHours", () => {
  it("returns null when no request has been answered yet", async () => {
    bookingFindMany.mockResolvedValue([]);
    expect(await getAverageResponseTimeHours()).toBeNull();
  });

  it("averages the hours between creation and the last update for answered bookings", async () => {
    bookingFindMany.mockResolvedValue([
      { createdAt: new Date("2030-01-01T00:00:00Z"), updatedAt: new Date("2030-01-01T02:00:00Z") },
      { createdAt: new Date("2030-01-01T00:00:00Z"), updatedAt: new Date("2030-01-01T06:00:00Z") },
    ]);
    expect(await getAverageResponseTimeHours()).toBeCloseTo(4);
  });

  it("only queries bookings that have actually been answered", async () => {
    bookingFindMany.mockResolvedValue([]);
    await getAverageResponseTimeHours();
    expect(bookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ["CONFIRMED", "REJECTED"] } },
      })
    );
  });
});
