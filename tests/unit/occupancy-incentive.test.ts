import { describe, expect, it } from "vitest";
import { occupancyIncentiveMessage } from "@/lib/occupancy-incentive";

describe("occupancyIncentiveMessage", () => {
  it("returns null once occupancy is already reasonably healthy", () => {
    expect(occupancyIncentiveMessage(50, 300000)).toBeNull();
    expect(occupancyIncentiveMessage(80, 300000)).toBeNull();
  });

  it("projects additional revenue from the partner's own real numbers, not a fabricated figure", () => {
    // 30% occupancy earned 300 000 cents (3000€) this month — fully
    // booked would be 3000 / 0.30 = 10 000€, so +7000€ of headroom.
    const message = occupancyIncentiveMessage(30, 300000);
    expect(message).toContain("70 %");
    // fr-FR formats the thousands separator as a narrow no-break space.
    expect(message).toMatch(/7\s000,00\s?€/);
  });

  it("falls back to an encouragement without a projected figure when there is no revenue yet", () => {
    const message = occupancyIncentiveMessage(0, 0);
    expect(message).toContain("100 %");
    expect(message).not.toMatch(/\d+ ?€/);
  });
});
