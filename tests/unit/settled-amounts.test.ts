import { describe, expect, it } from "vitest";
import { keptAmounts } from "@/server/domains/payments/settled-amounts";

// 100 € booking: 85 € landlord share, 15 € commission.
const base = { amountCents: 10000, netAmountCents: 8500 };

describe("keptAmounts — revenue net of settled refunds", () => {
  it("no refund: everything kept", () => {
    expect(keptAmounts({ ...base, refunds: [] })).toMatchObject({ grossCents: 10000, netCents: 8500, commissionCents: 1500 });
  });

  it("client cancels 30 h ahead: 42.50 € refunded by the landlord, commission kept", () => {
    expect(keptAmounts({ ...base, refunds: [{ amountCents: 4250, landlordReversalCents: 4250 }] })).toMatchObject({
      grossCents: 5750,
      netCents: 4250,
      commissionCents: 1500,
    });
  });

  it("landlord cancels: nothing kept by anyone", () => {
    expect(keptAmounts({ ...base, refunds: [{ amountCents: 10000, landlordReversalCents: 8500 }] })).toMatchObject({
      grossCents: 0,
      netCents: 0,
      commissionCents: 0,
    });
  });

  it("legacy refund borne by the platform shows as negative commission", () => {
    expect(keptAmounts({ ...base, refunds: [{ amountCents: 3000, landlordReversalCents: 0 }] }).commissionCents).toBe(-1500);
  });
});
