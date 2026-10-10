import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * Payouts (decided 10/10/2026): the platform keeps the money until the stay
 * is over, then pays the landlord weekly or monthly, net of the commission
 * and of any cancellation penalty — against a real database.
 */

const state = vi.hoisted(() => ({ accountReady: true, transferFails: false }));

const provider = vi.hoisted(() => ({
  name: "stripe",
  assertConnectedAccountCanBeCharged: vi.fn(),
  createTransfer: vi.fn(),
}));

const emails = vi.hoisted(() => ({ sendPayoutPaid: vi.fn() }));

vi.mock("@/server/domains/payments/get-payment-provider", () => ({ getPaymentProvider: () => provider }));
vi.mock("@/server/domains/notifications/send-payout-emails", () => emails);

describe.skipIf(!hasDatabase)("payouts", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let runDuePayouts: typeof import("@/server/domains/payouts/run-payouts").runDuePayouts;
  let syncEarningLines: typeof import("@/server/domains/payouts/lines").syncEarningLines;
  let fixtures: typeof import("./helpers/test-fixtures");

  let orgId: string;
  let clientId: string;
  let landlordUserId: string;
  let propertyId: string;

  // A Monday-morning "now", comfortably after the monthly (1 Nov) and weekly boundaries.
  const NOW = new Date("2030-03-04T09:00:00Z"); // Monday 4 March 2030, 10:00 Paris
  const hoursBefore = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

  async function insertBooking(opts: {
    status: "COMPLETED" | "CANCELLED";
    endedHoursAgo: number;
    paymentStatus?: "SUCCEEDED" | "PARTIALLY_REFUNDED";
    cancelledHoursAgo?: number;
    refunds?: { amountCents: number; landlordReversalCents: number; status: "PENDING" | "SUCCEEDED" }[];
  }) {
    const space = await fixtures.createTestSpace(orgId, propertyId, { status: "PUBLISHED" });
    const endsAt = hoursBefore(opts.endedHoursAgo);
    const booking = await prisma.booking.create({
      data: {
        spaceId: space.id,
        organizationId: orgId,
        clientUserId: clientId,
        startsAt: new Date(endsAt.getTime() - 3_600_000),
        endsAt,
        status: opts.status,
        participantsCount: 2,
        purpose: "Test",
        priceAmountCents: 10000,
        commissionAmountCents: 1500,
        ...(opts.cancelledHoursAgo !== undefined ? { cancelledAt: hoursBefore(opts.cancelledHoursAgo), cancelledBy: "CLIENT" as const } : {}),
      },
    });
    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        organizationId: orgId,
        provider: "stripe",
        providerPaymentIntentId: `pi_${booking.id}`,
        amountCents: 10000,
        commissionAmountCents: 1500,
        netAmountCents: 8500,
        status: opts.paymentStatus ?? "SUCCEEDED",
        capturedAt: hoursBefore(opts.endedHoursAgo + 48),
      },
    });
    for (const [index, refund] of (opts.refunds ?? []).entries()) {
      await prisma.refund.create({
        data: {
          paymentId: payment.id,
          amountCents: refund.amountCents,
          reason: "test",
          providerRefundId: `re_${booking.id}_${index}`,
          status: refund.status,
          landlordReversalCents: refund.landlordReversalCents,
        },
      });
    }
    return booking;
  }

  async function wipe() {
    await prisma.payoutLine.deleteMany({ where: { organizationId: orgId } });
    await prisma.payout.deleteMany({ where: { organizationId: orgId } });
    const payments = await prisma.payment.findMany({ where: { organizationId: orgId }, select: { id: true } });
    await prisma.refund.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
    const bookings = await prisma.booking.findMany({ where: { organizationId: orgId }, select: { id: true } });
    const disputes = await prisma.dispute.findMany({ where: { bookingId: { in: bookings.map((b) => b.id) } }, select: { id: true } });
    await prisma.disputeEvent.deleteMany({ where: { disputeId: { in: disputes.map((d) => d.id) } } });
    await prisma.dispute.deleteMany({ where: { id: { in: disputes.map((d) => d.id) } } });
    await prisma.payment.deleteMany({ where: { organizationId: orgId } });
    await prisma.booking.deleteMany({ where: { organizationId: orgId } });
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    ({ runDuePayouts } = await import("@/server/domains/payouts/run-payouts"));
    ({ syncEarningLines } = await import("@/server/domains/payouts/lines"));
    fixtures = await import("./helpers/test-fixtures");
    const [client, landlord] = await Promise.all([
      fixtures.createTestUser({ role: "CLIENT", name: "Payout Client" }),
      fixtures.createTestUser({ role: "CLIENT", name: "Payout Landlord" }),
    ]);
    clientId = client.id;
    landlordUserId = landlord.id;
    const org = await fixtures.createTestOrganization({ name: "Payout Org" });
    orgId = org.id;
    await prisma.organization.update({ where: { id: orgId }, data: { status: "VERIFIED", stripeAccountId: "acct_payout" } });
    await prisma.organizationMember.create({ data: { organizationId: orgId, profileId: landlordUserId, orgRole: "OWNER" } });
    propertyId = (await fixtures.createTestProperty(orgId, landlordUserId)).id;
  });

  beforeEach(async () => {
    await wipe();
    await prisma.organization.update({ where: { id: orgId }, data: { payoutFrequency: "MONTHLY", stripeAccountId: "acct_payout" } });
    state.accountReady = true;
    state.transferFails = false;
    emails.sendPayoutPaid.mockReset().mockResolvedValue(undefined);
    provider.assertConnectedAccountCanBeCharged.mockReset().mockImplementation(async () => {
      if (!state.accountReady) throw new Error("not payable");
    });
    provider.createTransfer.mockReset().mockImplementation(async (p: { idempotencyKey: string }) => {
      if (state.transferFails) throw new Error("stripe down");
      return { providerTransferId: `tr_${p.idempotencyKey}` };
    });
  });

  afterAll(async () => {
    if (orgId) await wipe();
    await prisma.$disconnect();
  });

  it("pays the landlord's share of a finished booking at the monthly boundary, once", async () => {
    const booking = await insertBooking({ status: "COMPLETED", endedHoursAgo: 200 });
    const result = await runDuePayouts(NOW);
    expect(result).toMatchObject({ earningsCreated: 1, created: 1, paid: 1 });

    const payout = await prisma.payout.findFirstOrThrow({ where: { organizationId: orgId }, include: { lines: true } });
    expect(payout).toMatchObject({ amountCents: 8500, status: "PAID" });
    expect(payout.scheduledFor.toISOString()).toBe("2030-02-28T23:00:00.000Z"); // 1 March 2030 00:00 Paris
    expect(payout.lines).toHaveLength(1);
    expect(payout.lines[0]).toMatchObject({ bookingId: booking.id, kind: "EARNING", amountCents: 8500 });
    expect(provider.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ connectedAccountId: "acct_payout", amountCents: 8500, idempotencyKey: payout.id })
    );
    expect(emails.sendPayoutPaid).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 8500 }));

    // A second run pays nothing more.
    provider.createTransfer.mockClear();
    expect(await runDuePayouts(NOW)).toMatchObject({ created: 0, paid: 0 });
    expect(provider.createTransfer).not.toHaveBeenCalled();
    expect(await prisma.payout.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it("keeps the money while the stay is not over, and during the 24 h dispute window", async () => {
    await insertBooking({ status: "COMPLETED", endedHoursAgo: 2 });
    const result = await runDuePayouts(NOW);
    // The earning exists but is not payable yet: nothing goes out, and it is
    // not eligible at the boundary either.
    expect(result.paid).toBe(0);
    expect(provider.createTransfer).not.toHaveBeenCalled();
  });

  it("a booking that ended after the boundary waits for the next one", async () => {
    // Ended 30 h ago: payable, but after the 1 March boundary -> next month.
    await insertBooking({ status: "COMPLETED", endedHoursAgo: 30 });
    const result = await runDuePayouts(NOW);
    expect(result.paid).toBe(0);
    expect(await prisma.payoutLine.count({ where: { organizationId: orgId, payoutId: null } })).toBe(1);
  });

  it("a weekly landlord is paid at the Monday boundary", async () => {
    await prisma.organization.update({ where: { id: orgId }, data: { payoutFrequency: "WEEKLY" } });
    await insertBooking({ status: "COMPLETED", endedHoursAgo: 72 });
    const result = await runDuePayouts(NOW); // Monday 10:00 Paris, boundary = 4 March 00:00 Paris
    expect(result.paid).toBe(1);
    const payout = await prisma.payout.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(payout.scheduledFor.toISOString()).toBe("2030-03-03T23:00:00.000Z");
  });

  it("deducts the commission owed after a landlord cancellation", async () => {
    const booking = await insertBooking({ status: "COMPLETED", endedHoursAgo: 200 });
    const cancelled = await insertBooking({ status: "CANCELLED", endedHoursAgo: 100, paymentStatus: "SUCCEEDED" });
    await prisma.payment.update({ where: { bookingId: cancelled.id }, data: { status: "REFUNDED" } });
    await prisma.payoutLine.create({
      data: { organizationId: orgId, bookingId: cancelled.id, kind: "CANCELLATION_PENALTY", amountCents: -1500, eligibleAt: hoursBefore(100) },
    });

    await runDuePayouts(NOW);
    const payout = await prisma.payout.findFirstOrThrow({ where: { organizationId: orgId }, include: { lines: true } });
    expect(payout.amountCents).toBe(7000); // 85 € earned - 15 € owed
    expect(payout.lines.map((l) => l.kind).sort()).toEqual(["CANCELLATION_PENALTY", "EARNING"]);
    expect(booking.id).toBeTruthy();
  });

  it("carries a negative balance over instead of paying", async () => {
    const cancelled = await insertBooking({ status: "CANCELLED", endedHoursAgo: 100 });
    await prisma.payment.update({ where: { bookingId: cancelled.id }, data: { status: "REFUNDED" } });
    await prisma.payoutLine.create({
      data: { organizationId: orgId, bookingId: cancelled.id, kind: "CANCELLATION_PENALTY", amountCents: -1500, eligibleAt: hoursBefore(100) },
    });
    const result = await runDuePayouts(NOW);
    expect(result).toMatchObject({ created: 0, paid: 0, carriedOver: 1 });
    expect(await prisma.payoutLine.count({ where: { organizationId: orgId, payoutId: null } })).toBe(1);
  });

  it("a client cancelling inside the window leaves the landlord their share, payable at once", async () => {
    // 50 € refunded, taken from the landlord's share: 85 - 50 = 35 € kept.
    await insertBooking({
      status: "CANCELLED",
      endedHoursAgo: 100,
      cancelledHoursAgo: 100,
      paymentStatus: "PARTIALLY_REFUNDED",
      refunds: [{ amountCents: 5000, landlordReversalCents: 5000, status: "SUCCEEDED" }],
    });
    await runDuePayouts(NOW);
    const payout = await prisma.payout.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(payout.amountCents).toBe(3500);
  });

  it("a client cancelling outside the window earns the landlord nothing", async () => {
    await insertBooking({
      status: "CANCELLED",
      endedHoursAgo: 100,
      cancelledHoursAgo: 100,
      paymentStatus: "PARTIALLY_REFUNDED",
      refunds: [{ amountCents: 8500, landlordReversalCents: 8500, status: "SUCCEEDED" }],
    });
    const result = await syncEarningLines(NOW);
    expect(result.created).toBe(0);
  });

  it("waits while a refund is still in flight, and while a dispute is open", async () => {
    await insertBooking({
      status: "CANCELLED",
      endedHoursAgo: 100,
      cancelledHoursAgo: 100,
      paymentStatus: "PARTIALLY_REFUNDED",
      refunds: [{ amountCents: 5000, landlordReversalCents: 5000, status: "PENDING" }],
    });
    const disputed = await insertBooking({ status: "COMPLETED", endedHoursAgo: 200 });
    await prisma.dispute.create({ data: { bookingId: disputed.id, raisedByUserId: clientId, description: "Non conforme" } });
    expect((await syncEarningLines(NOW)).created).toBe(0);
  });

  it("a dispute raised after the earning was recorded holds the payout back", async () => {
    const booking = await insertBooking({ status: "COMPLETED", endedHoursAgo: 200 });
    expect((await syncEarningLines(NOW)).created).toBe(1);
    const dispute = await prisma.dispute.create({ data: { bookingId: booking.id, raisedByUserId: clientId, description: "Non conforme" } });
    expect((await runDuePayouts(NOW)).paid).toBe(0);
    expect(provider.createTransfer).not.toHaveBeenCalled();

    await prisma.dispute.update({ where: { id: dispute.id }, data: { status: "RESOLVED_NO_ACTION" } });
    expect((await runDuePayouts(NOW)).paid).toBe(1);
  });

  it("waits for a landlord whose payout account is not ready, without losing anything", async () => {
    state.accountReady = false;
    await insertBooking({ status: "COMPLETED", endedHoursAgo: 200 });
    const result = await runDuePayouts(NOW);
    expect(result).toMatchObject({ created: 0, paid: 0, waiting: 1 });
    expect(await prisma.payoutLine.count({ where: { organizationId: orgId, payoutId: null } })).toBe(1);

    state.accountReady = true;
    expect((await runDuePayouts(NOW)).paid).toBe(1);
  });

  it("a failed transfer is retried with the same key and never paid twice", async () => {
    await insertBooking({ status: "COMPLETED", endedHoursAgo: 200 });
    state.transferFails = true;
    expect(await runDuePayouts(NOW)).toMatchObject({ created: 1, failed: 1, paid: 0 });
    const failed = await prisma.payout.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(failed).toMatchObject({ status: "FAILED", amountCents: 8500 });

    state.transferFails = false;
    await prisma.payout.update({ where: { id: failed.id }, data: { updatedAt: hoursBefore(1) } });
    expect(await runDuePayouts(NOW)).toMatchObject({ created: 0, paid: 1 });
    const retried = await prisma.payout.findUniqueOrThrow({ where: { id: failed.id } });
    expect(retried.status).toBe("PAID");
    expect(provider.createTransfer).toHaveBeenLastCalledWith(expect.objectContaining({ idempotencyKey: failed.id }));
    expect(await prisma.payout.count({ where: { organizationId: orgId } })).toBe(1);
  });
});
