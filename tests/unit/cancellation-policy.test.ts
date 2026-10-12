import { describe, expect, it } from "vitest";
import {
  clientCancellationRefund,
  landlordCancellationPenaltyCents,
  isCancellationWindowHours,
  cancellationWindowLabel,
} from "@/lib/cancellation-policy";

// 100 € booking, 15 € commission: the landlord's share is 85 €.
const BOOKING = { priceAmountCents: 10000, commissionAmountCents: 1500 };
const NOW = new Date("2031-06-01T10:00:00Z");
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe("client cancellation policy (decided 10/10/2026)", () => {
  it("outside the window: refunded in full except the commission", () => {
    expect(
      clientCancellationRefund({ ...BOOKING, cancellationWindowHours: 48, startsAt: hoursFromNow(49), now: NOW })
    ).toEqual({ tier: "FULL", refundCents: 8500 });
  });

  it("inside the window: half of the price, commission kept from the other half", () => {
    expect(
      clientCancellationRefund({ ...BOOKING, cancellationWindowHours: 48, startsAt: hoursFromNow(30), now: NOW })
    ).toEqual({ tier: "PARTIAL", refundCents: 5000 });
  });

  it("exactly at the window boundary is already inside", () => {
    expect(
      clientCancellationRefund({ ...BOOKING, cancellationWindowHours: 168, startsAt: hoursFromNow(168), now: NOW }).tier
    ).toBe("PARTIAL");
  });

  it("a 7 day window: 6 days before is inside, 8 days before is outside", () => {
    expect(
      clientCancellationRefund({ ...BOOKING, cancellationWindowHours: 168, startsAt: hoursFromNow(144), now: NOW }).tier
    ).toBe("PARTIAL");
    expect(
      clientCancellationRefund({ ...BOOKING, cancellationWindowHours: 168, startsAt: hoursFromNow(192), now: NOW }).tier
    ).toBe("FULL");
  });

  it("no window: always the full refund minus the commission, even an hour before", () => {
    expect(
      clientCancellationRefund({ ...BOOKING, cancellationWindowHours: 0, startsAt: hoursFromNow(1), now: NOW })
    ).toEqual({ tier: "FULL", refundCents: 8500 });
  });

  it("rounds the half down to the cent", () => {
    expect(
      clientCancellationRefund({
        priceAmountCents: 8501,
        commissionAmountCents: 1275,
        cancellationWindowHours: 48,
        startsAt: hoursFromNow(10),
        now: NOW,
      }).refundCents
    ).toBe(4250);
  });

  it("never refunds the commission, even when it exceeds half of the price", () => {
    expect(
      clientCancellationRefund({
        priceAmountCents: 1000,
        commissionAmountCents: 700,
        cancellationWindowHours: 48,
        startsAt: hoursFromNow(10),
        now: NOW,
      }).refundCents
    ).toBe(300);
  });
});

describe("landlord cancellation penalty", () => {
  it("inside the window the landlord owes the commission", () => {
    expect(
      landlordCancellationPenaltyCents({ commissionAmountCents: 1500, cancellationWindowHours: 168, startsAt: hoursFromNow(100), now: NOW })
    ).toBe(1500);
  });

  it("outside the window, or with no window, nothing is owed", () => {
    expect(
      landlordCancellationPenaltyCents({ commissionAmountCents: 1500, cancellationWindowHours: 168, startsAt: hoursFromNow(200), now: NOW })
    ).toBe(0);
    expect(
      landlordCancellationPenaltyCents({ commissionAmountCents: 1500, cancellationWindowHours: 0, startsAt: hoursFromNow(1), now: NOW })
    ).toBe(0);
  });
});

describe("window options", () => {
  it("accepts only the four windows offered", () => {
    expect([0, 48, 168, 720].every(isCancellationWindowHours)).toBe(true);
    expect(isCancellationWindowHours(24)).toBe(false);
    expect(cancellationWindowLabel(720)).toBe("1 mois");
    expect(cancellationWindowLabel(0)).toBeNull();
  });
});
