import { describe, expect, it } from "vitest";
import { clientCancellationRefund } from "@/lib/cancellation-policy";

// 100 € booking, 15 € commission: the landlord's share is 85 €.
const BOOKING = { priceAmountCents: 10000, commissionAmountCents: 1500 };
const NOW = new Date("2031-06-01T10:00:00Z");
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe("client cancellation policy (decided 06/10/2026)", () => {
  it("more than 48 h before: the landlord's share back, commission kept", () => {
    expect(clientCancellationRefund({ ...BOOKING, startsAt: hoursFromNow(49), now: NOW })).toEqual({
      tier: "FULL",
      refundCents: 8500,
    });
  });

  it("exactly 48 h before is already the 50 % tier", () => {
    expect(clientCancellationRefund({ ...BOOKING, startsAt: hoursFromNow(48), now: NOW }).tier).toBe("PARTIAL");
  });

  it("between 48 h and 24 h: half of the landlord's share", () => {
    expect(clientCancellationRefund({ ...BOOKING, startsAt: hoursFromNow(30), now: NOW })).toEqual({
      tier: "PARTIAL",
      refundCents: 4250,
    });
  });

  it("24 h or less before: nothing", () => {
    expect(clientCancellationRefund({ ...BOOKING, startsAt: hoursFromNow(24), now: NOW })).toEqual({
      tier: "NONE",
      refundCents: 0,
    });
    expect(clientCancellationRefund({ ...BOOKING, startsAt: hoursFromNow(1), now: NOW }).refundCents).toBe(0);
  });

  it("rounds a half cent down, never refunding more than the policy", () => {
    const odd = { priceAmountCents: 10001, commissionAmountCents: 1500 }; // share 8501
    expect(clientCancellationRefund({ ...odd, startsAt: hoursFromNow(30), now: NOW }).refundCents).toBe(4250);
  });
});
