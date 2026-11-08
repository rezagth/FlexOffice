import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * C1 — the cached readiness flags come from a LIVE read of the Stripe
 * account, never from an event payload (an `account.updated` delivered late
 * or out of order must not flip them to a stale value), and a sweep catches
 * the landlords whose event never arrived.
 */

const accountRetrieve = vi.fn();
const organizationFindUniqueOrThrow = vi.fn();
const organizationFindFirst = vi.fn();
const organizationFindMany = vi.fn();
const organizationUpdate = vi.fn();
const recordAudit = vi.fn();

vi.mock("stripe", () => ({
  default: class {
    accounts = { retrieve: accountRetrieve };
  },
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    organization: {
      findUniqueOrThrow: organizationFindUniqueOrThrow,
      findFirst: organizationFindFirst,
      findMany: organizationFindMany,
      update: organizationUpdate,
    },
  },
}));
vi.mock("@/server/lib/audit", () => ({ recordAudit }));
vi.mock("@/server/lib/logger", () => ({ logEvent: vi.fn(), logError: vi.fn() }));

const { recordConnectAccountUpdate, refreshConnectReadiness, refreshPendingConnectAccounts, getAccountStatus } =
  await import("@/server/domains/payments/stripe-connect");

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  for (const mock of [accountRetrieve, organizationFindUniqueOrThrow, organizationFindFirst, organizationFindMany, organizationUpdate, recordAudit]) {
    mock.mockReset();
  }
  organizationUpdate.mockResolvedValue({});
  recordAudit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("refreshConnectReadiness", () => {
  it("stores what Stripe says right now", async () => {
    organizationFindUniqueOrThrow.mockResolvedValue({ stripeAccountId: "acct_1" });
    accountRetrieve.mockResolvedValue({ charges_enabled: true, payouts_enabled: true, details_submitted: true });

    const status = await refreshConnectReadiness("org-1");

    expect(status).toEqual({ connected: true, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true });
    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: expect.objectContaining({ stripeChargesEnabled: true, stripePayoutsEnabled: true }),
    });
  });

  it("marks an organization without an account as not ready, without calling Stripe", async () => {
    organizationFindUniqueOrThrow.mockResolvedValue({ stripeAccountId: null });

    expect(await refreshConnectReadiness("org-1")).toEqual({ connected: false });
    expect(accountRetrieve).not.toHaveBeenCalled();
    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: expect.objectContaining({ stripeChargesEnabled: false, stripePayoutsEnabled: false }),
    });
  });

  it("is what getAccountStatus (onboarding return, status page) does", async () => {
    organizationFindUniqueOrThrow.mockResolvedValue({ stripeAccountId: "acct_1" });
    accountRetrieve.mockResolvedValue({ charges_enabled: false, payouts_enabled: false, details_submitted: false });

    await getAccountStatus("org-1");
    expect(organizationUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("recordConnectAccountUpdate", () => {
  it("ignores the payload's flags: a stale event cannot grant visibility", async () => {
    organizationFindFirst.mockResolvedValue({ id: "org-1" });
    organizationFindUniqueOrThrow.mockResolvedValue({ stripeAccountId: "acct_1" });
    // The (old) event says enabled, Stripe now says disabled.
    accountRetrieve.mockResolvedValue({ charges_enabled: false, payouts_enabled: false, details_submitted: true });

    await recordConnectAccountUpdate({ id: "acct_1", charges_enabled: true, payouts_enabled: true });

    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ event: "stripe_connect.account_updated" }));
    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: expect.objectContaining({ stripeChargesEnabled: false, stripePayoutsEnabled: false }),
    });
  });

  it("ignores an account this app did not create", async () => {
    organizationFindFirst.mockResolvedValue(null);
    await recordConnectAccountUpdate({ id: "acct_stranger" });
    expect(accountRetrieve).not.toHaveBeenCalled();
    expect(organizationUpdate).not.toHaveBeenCalled();
  });
});

describe("refreshPendingConnectAccounts (maintenance sweep)", () => {
  it("does nothing without real Stripe", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "mock");
    expect(await refreshPendingConnectAccounts()).toEqual({ checked: 0, becameReady: 0, failed: 0 });
    expect(organizationFindMany).not.toHaveBeenCalled();
  });

  it("re-reads not-ready accounts, a bounded batch, and counts those that became ready", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "stripe");
    organizationFindMany.mockResolvedValue([{ id: "org-1" }, { id: "org-2" }]);
    organizationFindUniqueOrThrow.mockResolvedValue({ stripeAccountId: "acct_1" });
    accountRetrieve
      .mockResolvedValueOnce({ charges_enabled: true, payouts_enabled: true, details_submitted: true })
      .mockRejectedValueOnce(new Error("stripe down"));

    const result = await refreshPendingConnectAccounts();

    expect(result).toEqual({ checked: 2, becameReady: 1, failed: 1 });
    const query = organizationFindMany.mock.calls[0][0];
    expect(query.take).toBeLessThanOrEqual(10);
    expect(query.where.stripeAccountId).toEqual({ not: null });
  });
});
