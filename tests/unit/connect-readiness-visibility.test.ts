import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * C1 — with real payments, a space whose landlord cannot take charges and
 * receive payouts is not listed. With the mock provider (dev, demo, tests)
 * every listing stays visible.
 */

vi.mock("@/server/db/prisma", () => ({ prisma: {} }));

const { isConnectReadinessRequired, isOrganizationPayable, publiclyVisibleOrganizationWhere } = await import(
  "@/server/domains/organizations/publication-guard"
);

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("without real payments", () => {
  it.each(["", "mock"])("PAYMENT_PROVIDER=%j: no Connect condition at all", (provider) => {
    vi.stubEnv("PAYMENT_PROVIDER", provider);
    expect(isConnectReadinessRequired()).toBe(false);
    expect(publiclyVisibleOrganizationWhere()).toEqual({ status: { in: ["VERIFIED"] } });
    expect(isOrganizationPayable({ stripeChargesEnabled: false, stripePayoutsEnabled: false })).toBe(true);
  });
});

describe("with PAYMENT_PROVIDER=stripe", () => {
  beforeEach(() => {
    vi.stubEnv("PAYMENT_PROVIDER", "stripe");
  });

  it("requires charges AND payouts enabled in the listing query", () => {
    expect(publiclyVisibleOrganizationWhere()).toEqual({
      status: { in: ["VERIFIED"] },
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    });
  });

  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, false],
    [false, false, false],
  ])("charges=%s payouts=%s → payable=%s", (charges, payouts, expected) => {
    expect(isOrganizationPayable({ stripeChargesEnabled: charges, stripePayoutsEnabled: payouts })).toBe(expected);
  });
});
