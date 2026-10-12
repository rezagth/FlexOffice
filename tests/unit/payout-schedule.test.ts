import { describe, expect, it } from "vitest";
import { dueBoundary, earningEligibleAt, nextBoundary } from "@/server/domains/payouts/schedule";

// Paris is UTC+2 in summer (CEST), UTC+1 in winter (CET).
describe("monthly boundary", () => {
  it("is the 1st at 00:00 Paris, from 08:00 that day", () => {
    // 1 Nov 2026 08:00 Paris = 07:00 UTC (winter time, CET)
    expect(dueBoundary("MONTHLY", new Date("2026-11-01T07:00:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("before 08:00 on the 1st it is still the previous month's boundary", () => {
    // 1 Nov 2026 06:30 Paris = 05:30 UTC
    expect(dueBoundary("MONTHLY", new Date("2026-11-01T05:30:00Z")).toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("mid-month, it is the 1st of that month", () => {
    expect(dueBoundary("MONTHLY", new Date("2026-10-15T12:00:00Z")).toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("the next payout is the 1st of the following month", () => {
    expect(nextBoundary("MONTHLY", new Date("2026-10-15T12:00:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(nextBoundary("MONTHLY", new Date("2026-12-20T12:00:00Z")).toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });
});

describe("weekly boundary", () => {
  it("is Monday 00:00 Paris", () => {
    // Saturday 10 Oct 2026 -> Monday 5 Oct 00:00 Paris (CEST) = 4 Oct 22:00 UTC
    expect(dueBoundary("WEEKLY", new Date("2026-10-10T10:00:00Z")).toISOString()).toBe("2026-10-04T22:00:00.000Z");
  });

  it("on Monday before 08:00 Paris it is still the previous Monday", () => {
    // Monday 12 Oct 2026 07:00 Paris = 05:00 UTC
    expect(dueBoundary("WEEKLY", new Date("2026-10-12T05:00:00Z")).toISOString()).toBe("2026-10-04T22:00:00.000Z");
  });

  it("on Monday from 08:00 Paris it is that Monday", () => {
    expect(dueBoundary("WEEKLY", new Date("2026-10-12T06:30:00Z")).toISOString()).toBe("2026-10-11T22:00:00.000Z");
  });

  it("Sunday belongs to the week that started the Monday before", () => {
    expect(dueBoundary("WEEKLY", new Date("2026-10-11T12:00:00Z")).toISOString()).toBe("2026-10-04T22:00:00.000Z");
  });

  it("the next payout is the following Monday", () => {
    expect(nextBoundary("WEEKLY", new Date("2026-10-10T10:00:00Z")).toISOString()).toBe("2026-10-11T22:00:00.000Z");
  });

  it("handles the clock change at the end of October", () => {
    // Monday 26 Oct 2026 00:00 Paris is already CET (UTC+1): 25 Oct 23:00 UTC
    expect(dueBoundary("WEEKLY", new Date("2026-10-28T12:00:00Z")).toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});

describe("earning eligibility", () => {
  it("opens 24 hours after the end of the stay", () => {
    expect(earningEligibleAt(new Date("2026-10-10T17:00:00Z")).toISOString()).toBe("2026-10-11T17:00:00.000Z");
  });
});
