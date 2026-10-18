import { describe, expect, it } from "vitest";
import { exemptAmount, formatVatRate, rentalVat, splitGross } from "@/server/domains/invoicing/vat";

/**
 * PRD V1.1, R65 — unit coverage for the pure VAT math, isolated from the
 * database. tests/integration/invoicing.test.ts already exercises these
 * indirectly through full invoice issuance (DB required); this file covers
 * the functions directly so the rounding rule itself is tested without a
 * database, and with every edge case the issuance path doesn't happen to
 * hit.
 */
describe("splitGross", () => {
  it("extracts VAT from a TTC amount at a round rate", () => {
    expect(splitGross(10000, 2000)).toEqual({
      totalCents: 10000,
      netCents: 8333,
      vatCents: 1667,
      vatRateBasisPoints: 2000,
      vatExempt: false,
    });
  });

  it("rounds net half-up on an odd-cent amount, same case tested against a real DB in the integration suite", () => {
    expect(splitGross(9999, 2000)).toEqual({
      totalCents: 9999,
      netCents: 8333,
      vatCents: 1666,
      vatRateBasisPoints: 2000,
      vatExempt: false,
    });
  });

  it("net + vat always equals the gross amount, never off by a cent from separate rounding", () => {
    for (const gross of [0, 1, 7, 99, 100, 101, 9999, 10000, 123456]) {
      for (const rateBp of [0, 550, 1000, 2000, 10000]) {
        const { netCents, vatCents, totalCents } = splitGross(gross, rateBp);
        expect(netCents + vatCents).toBe(totalCents);
      }
    }
  });

  it("rounds a half-cent tie up (half-up, never half-even)", () => {
    // 1 cent at 100% VAT: net = round-half-up(1 * 10000 / 20000) = round-half-up(0.5) = 1.
    expect(splitGross(1, 10000)).toEqual({
      totalCents: 1,
      netCents: 1,
      vatCents: 0,
      vatRateBasisPoints: 10000,
      vatExempt: false,
    });
  });

  it("a zero amount splits to all zeros, at any rate", () => {
    expect(splitGross(0, 2000)).toMatchObject({ netCents: 0, vatCents: 0 });
  });

  it("a zero rate leaves the whole amount as net", () => {
    expect(splitGross(10000, 0)).toMatchObject({ netCents: 10000, vatCents: 0 });
  });

  it("rejects a non-integer or negative gross amount", () => {
    expect(() => splitGross(10.5, 2000)).toThrow();
    expect(() => splitGross(-1, 2000)).toThrow();
  });

  it("rejects a VAT rate outside [0, 10000] basis points, or non-integer", () => {
    expect(() => splitGross(10000, -1)).toThrow();
    expect(() => splitGross(10000, 10001)).toThrow();
    expect(() => splitGross(10000, 20.5)).toThrow();
  });
});

describe("exemptAmount", () => {
  it("collects no VAT: the whole gross amount is net", () => {
    expect(exemptAmount(9999)).toEqual({
      totalCents: 9999,
      netCents: 9999,
      vatCents: 0,
      vatRateBasisPoints: 0,
      vatExempt: true,
    });
  });

  it("rejects a non-integer or negative amount", () => {
    expect(() => exemptAmount(-1)).toThrow();
    expect(() => exemptAmount(1.5)).toThrow();
  });
});

describe("rentalVat", () => {
  it("is exempt when the landlord has no VAT number (null, undefined, or blank)", () => {
    for (const vatNumber of [null, undefined, "", "   "]) {
      expect(rentalVat(10000, vatNumber, 2000)).toMatchObject({ vatExempt: true, netCents: 10000, vatCents: 0 });
    }
  });

  it("collects VAT at the given rate once the landlord has a VAT number", () => {
    expect(rentalVat(10000, "FR12345678901", 2000)).toMatchObject({
      vatExempt: false,
      netCents: 8333,
      vatCents: 1667,
    });
  });
});

describe("formatVatRate", () => {
  it("formats a round percentage without decimals", () => {
    expect(formatVatRate(2000)).toBe("20 %");
    expect(formatVatRate(0)).toBe("0 %");
  });

  it("formats a fractional percentage with a French decimal comma", () => {
    expect(formatVatRate(550)).toBe("5,5 %");
  });
});
