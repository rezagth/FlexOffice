import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasDatabase } from "./helpers/should-run";

/**
 * Payments lot (audit 06/10/2026): card holds, Connect gate, expiry,
 * completion, cancellations and refund funding — against a real database,
 * with a recording payment provider behaving like Stripe or like the mock.
 */

const state = vi.hoisted(() => ({
  confirm: true,
  refundFails: false as false | "declined" | "timeout",
  accountReady: true,
}));

const provider = vi.hoisted(() => ({
  name: "stripe",
  signatureHeaderName: "stripe-signature",
  createPaymentIntent: vi.fn(),
  assertConnectedAccountCanBeCharged: vi.fn(),
  capturePaymentIntent: vi.fn(),
  cancelPaymentIntent: vi.fn(),
  refundPayment: vi.fn(),
  verifyWebhookEvent: vi.fn(),
}));

const emails = vi.hoisted(() => ({
  sendBookingRequested: vi.fn(),
  sendBookingRequestReceived: vi.fn(),
  sendBookingConfirmed: vi.fn(),
  sendBookingRejected: vi.fn(),
  sendBookingExpired: vi.fn(),
  sendBookingCancelledByClient: vi.fn(),
  sendBookingCancelledByLandlord: vi.fn(),
}));

vi.mock("@/server/domains/payments/get-payment-provider", () => ({ getPaymentProvider: () => provider }));
vi.mock("@/server/domains/notifications/send-booking-emails", () => emails);

describe.skipIf(!hasDatabase)("booking lifecycle — holds, expiry, cancellation, refunds", () => {
  let prisma: typeof import("@/server/db/prisma").prisma;
  let createBooking: typeof import("@/server/domains/bookings/create-booking").createBooking;
  let holds: typeof import("@/server/domains/bookings/payment-holds");
  let maintenance: typeof import("@/server/domains/bookings/expire-stale");
  let cancel: typeof import("@/server/domains/bookings/cancel");
  let acceptBookingRequest: typeof import("@/server/domains/bookings/accept-reject").acceptBookingRequest;
  let resolveDispute: typeof import("@/server/domains/disputes/review").resolveDispute;
  let fixtures: typeof import("./helpers/test-fixtures");

  let orgId: string;
  let spaceId: string;
  let clientId: string;
  let otherClientId: string;
  let landlordUserId: string;
  let dayOffset = 400; // each test books its own far-future day

  const nextDate = () => {
    dayOffset += 1;
    return new Date(Date.UTC(2030, 0, 1) + dayOffset * 86_400_000).toISOString().slice(0, 10);
  };
  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000);

  let propertyId: string;

  /** A booking + payment inserted directly in a given state — each on its
   * own space, so arbitrary time ranges never trip the EXCLUDE constraint. */
  async function insertBooking(opts: {
    status: "PENDING" | "CONFIRMED" | "AWAITING_PAYMENT";
    startsInHours: number;
    paymentStatus?: "SUCCEEDED" | "REQUIRES_CAPTURE" | "AWAITING_AUTHORIZATION" | null;
    clientUserId?: string;
    createdAt?: Date;
    endsInHours?: number;
  }) {
    const ownSpace = await fixtures.createTestSpace(orgId, propertyId, { status: "PUBLISHED" });
    const startsAt = hoursFromNow(opts.startsInHours);
    const endsAt =
      opts.endsInHours !== undefined ? hoursFromNow(opts.endsInHours) : new Date(startsAt.getTime() + 3_600_000);
    const booking = await prisma.booking.create({
      data: {
        spaceId: ownSpace.id,
        organizationId: orgId,
        clientUserId: opts.clientUserId ?? clientId,
        startsAt,
        endsAt,
        status: opts.status,
        participantsCount: 2,
        purpose: "Test",
        priceAmountCents: 10000,
        commissionAmountCents: 1500,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      },
    });
    if (opts.paymentStatus !== null) {
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          organizationId: orgId,
          provider: "stripe",
          providerPaymentIntentId: `pi_${booking.id}`,
          amountCents: 10000,
          commissionAmountCents: 1500,
          netAmountCents: 8500,
          status: opts.paymentStatus ?? (opts.status === "CONFIRMED" ? "SUCCEEDED" : "REQUIRES_CAPTURE"),
          ...(opts.status === "CONFIRMED" ? { capturedAt: new Date() } : {}),
        },
      });
    }
    return booking;
  }

  const reload = (id: string) =>
    prisma.booking.findUniqueOrThrow({ where: { id }, include: { payment: { include: { refunds: true } } } });

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    ({ createBooking } = await import("@/server/domains/bookings/create-booking"));
    holds = await import("@/server/domains/bookings/payment-holds");
    maintenance = await import("@/server/domains/bookings/expire-stale");
    cancel = await import("@/server/domains/bookings/cancel");
    ({ acceptBookingRequest } = await import("@/server/domains/bookings/accept-reject"));
    ({ resolveDispute } = await import("@/server/domains/disputes/review"));
    fixtures = await import("./helpers/test-fixtures");

    const [client, other, landlord] = await Promise.all([
      fixtures.createTestUser({ role: "CLIENT", name: "Lifecycle Client" }),
      fixtures.createTestUser({ role: "CLIENT", name: "Other Client" }),
      fixtures.createTestUser({ role: "CLIENT", name: "Landlord User" }),
    ]);
    clientId = client.id;
    otherClientId = other.id;
    landlordUserId = landlord.id;

    const org = await fixtures.createTestOrganization({ name: "Lifecycle Org" });
    orgId = org.id;
    await prisma.organization.update({ where: { id: orgId }, data: { status: "VERIFIED", stripeAccountId: "acct_test" } });
    await prisma.organizationMember.create({
      data: { organizationId: orgId, profileId: landlordUserId, orgRole: "OWNER" },
    });
    const property = await fixtures.createTestProperty(orgId, landlordUserId);
    propertyId = property.id;
    const space = await fixtures.createTestSpace(orgId, property.id, { status: "PUBLISHED" });
    spaceId = space.id;
    await prisma.spaceOpeningHours.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ spaceId, weekday, opensAt: "08:00", closesAt: "20:00" })),
    });
  });

  beforeEach(() => {
    state.confirm = true;
    state.refundFails = false;
    state.accountReady = true;
    for (const fn of Object.values(emails)) fn.mockReset().mockResolvedValue(undefined);
    provider.createPaymentIntent.mockReset().mockImplementation(async ({ bookingId }: { bookingId: string }) => ({
      providerPaymentIntentId: `pi_${bookingId}`,
      clientSecret: state.confirm ? "cs_test" : undefined,
      requiresClientConfirmation: state.confirm,
    }));
    provider.assertConnectedAccountCanBeCharged.mockReset().mockImplementation(async () => {
      if (!state.accountReady) {
        const { ConflictError } = await import("@/server/lib/errors");
        throw new ConflictError("not payable");
      }
    });
    provider.capturePaymentIntent.mockReset().mockResolvedValue({ outcome: "succeeded" });
    provider.cancelPaymentIntent.mockReset().mockResolvedValue({ outcome: "succeeded" });
    provider.refundPayment.mockReset().mockImplementation(async (p: { amountCents: number; funding: string; idempotencyKey: string }) => {
      if (state.refundFails === "declined") {
        const { RefundDeclinedError } = await import("@/server/domains/payments/provider");
        throw new RefundDeclinedError("No such charge");
      }
      if (state.refundFails === "timeout") throw new Error("ETIMEDOUT");
      return {
        providerRefundId: `re_${p.idempotencyKey}`,
        outcome: "succeeded",
        reversedFromLandlord: true,
        applicationFeeRefunded: p.funding === "LANDLORD_AND_FEE",
      };
    });
  });

  afterAll(async () => {
    if (orgId) {
      const payments = await prisma.payment.findMany({ where: { organizationId: orgId }, select: { id: true } });
      await prisma.refund.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
      const bookings = await prisma.booking.findMany({ where: { organizationId: orgId }, select: { id: true } });
      const disputes = await prisma.dispute.findMany({ where: { bookingId: { in: bookings.map((b) => b.id) } }, select: { id: true } });
      await prisma.disputeEvent.deleteMany({ where: { disputeId: { in: disputes.map((d) => d.id) } } });
      await prisma.dispute.deleteMany({ where: { id: { in: disputes.map((d) => d.id) } } });
      await prisma.payment.deleteMany({ where: { organizationId: orgId } });
      await prisma.booking.deleteMany({ where: { organizationId: orgId } });
    }
    await prisma.$disconnect();
  });

  const book = (clientUserId = clientId, date = nextDate()) =>
    createBooking(clientUserId, { spaceId, date, slot: "MORNING", participantsCount: 2, purpose: "Réunion", acceptTerms: true });

  describe("card step (Stripe-like provider)", () => {
    it("holds the slot in AWAITING_PAYMENT, silently, and passes the commission as application fee", async () => {
      const { booking, clientSecret } = await book();
      const row = await reload(booking.id);

      expect(row.status).toBe("AWAITING_PAYMENT");
      expect(row.payment?.status).toBe("AWAITING_AUTHORIZATION");
      expect(clientSecret).toBe("cs_test");
      expect(provider.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: row.priceAmountCents, applicationFeeCents: row.commissionAmountCents, connectedAccountId: "acct_test" })
      );
      expect(emails.sendBookingRequestReceived).not.toHaveBeenCalled();
      // Not a request yet: the landlord cannot accept it.
      await expect(acceptBookingRequest(orgId, booking.id)).rejects.toMatchObject({ status: 409 });
    });

    it("keeps the slot for one client: a second client is refused during the card step", async () => {
      const date = nextDate();
      await book(clientId, date);
      await expect(book(otherClientId, date)).rejects.toMatchObject({ status: 409 });
    });

    it("becomes a request on authorization, announced exactly once", async () => {
      const { booking } = await book();
      await holds.applyAuthorization(`pi_${booking.id}`);
      await holds.applyAuthorization(`pi_${booking.id}`); // retried webhook

      const row = await reload(booking.id);
      expect(row.status).toBe("PENDING");
      expect(row.payment?.status).toBe("REQUIRES_CAPTURE");
      expect(emails.sendBookingRequestReceived).toHaveBeenCalledTimes(1);
    });

    it("releases an abandoned card step, frees the slot, and cancels a late authorization", async () => {
      const date = nextDate();
      const { booking } = await book(clientId, date);
      await prisma.booking.update({ where: { id: booking.id }, data: { createdAt: new Date(Date.now() - 20 * 60_000) } });

      await holds.releaseAbandonedPaymentHolds();
      const row = await reload(booking.id);
      expect(row.status).toBe("CANCELLED");
      expect(row.cancelledBy).toBe("SYSTEM");
      expect(row.payment?.status).toBe("FAILED");
      expect(provider.cancelPaymentIntent).toHaveBeenCalledWith(`pi_${booking.id}`, "abandoned");

      // The slot is bookable again.
      await expect(book(otherClientId, date)).resolves.toBeDefined();

      provider.cancelPaymentIntent.mockClear();
      await holds.applyAuthorization(`pi_${booking.id}`);
      expect((await reload(booking.id)).status).toBe("CANCELLED");
      expect(provider.cancelPaymentIntent).toHaveBeenCalledWith(`pi_${booking.id}`, "abandoned");
      expect(emails.sendBookingRequestReceived).not.toHaveBeenCalled();
    });
  });

  describe("guards at creation", () => {
    it("charges nothing for a landlord who cannot be paid out", async () => {
      state.accountReady = false;
      const before = await prisma.booking.count({ where: { spaceId } });
      await expect(book()).rejects.toMatchObject({ status: 409 });
      expect(await prisma.booking.count({ where: { spaceId } })).toBe(before);
      expect(provider.createPaymentIntent).not.toHaveBeenCalled();
    });

    it("refuses a landlord booking their own space", async () => {
      await expect(book(landlordUserId)).rejects.toMatchObject({ status: 409 });
    });

    it("caps open requests per client", async () => {
      const capped = await fixtures.createTestUser({ role: "CLIENT", name: "Capped" });
      state.confirm = false; // mock-like: straight to PENDING
      for (let i = 0; i < holds.MAX_OPEN_REQUESTS_PER_CLIENT; i++) await book(capped.id);
      await expect(book(capped.id)).rejects.toThrow(/demandes en attente/);
    });
  });

  describe("scheduled maintenance", () => {
    it("expires a request whose slot has started, even if younger than 48 h", async () => {
      const started = await insertBooking({ status: "PENDING", startsInHours: -1, endsInHours: 1 });
      await maintenance.expireStaleBookingRequests();
      expect((await reload(started.id)).status).toBe("REJECTED");
      expect(provider.cancelPaymentIntent).toHaveBeenCalledWith(`pi_${started.id}`, "abandoned");
    });

    it("closes a PENDING booking left without payment instead of skipping it forever", async () => {
      const orphan = await insertBooking({
        status: "PENDING",
        startsInHours: 200,
        paymentStatus: null,
        createdAt: new Date(Date.now() - 49 * 3_600_000),
      });
      await maintenance.expireStaleBookingRequests();
      expect((await reload(orphan.id)).status).toBe("REJECTED");
    });

    it("marks finished bookings COMPLETED", async () => {
      const done = await insertBooking({ status: "CONFIRMED", startsInHours: -3, endsInHours: -1 });
      await maintenance.completeFinishedBookings();
      expect((await reload(done.id)).status).toBe("COMPLETED");
    });

    it("refuses to accept a request once its slot has started", async () => {
      const started = await insertBooking({ status: "PENDING", startsInHours: -0.5, endsInHours: 2 });
      await expect(acceptBookingRequest(orgId, started.id)).rejects.toMatchObject({ status: 409 });
      expect(provider.capturePaymentIntent).not.toHaveBeenCalled();
    });
  });

  describe("client cancellation", () => {
    it("cancels a pending request for free and releases the card", async () => {
      const pending = await insertBooking({ status: "PENDING", startsInHours: 100 });
      const result = await cancel.cancelBookingAsClient(clientId, pending.id);
      const row = await reload(pending.id);

      expect(result.refundCents).toBe(0);
      expect(row).toMatchObject({ status: "CANCELLED", cancelledBy: "CLIENT" });
      expect(row.payment?.status).toBe("FAILED");
      expect(provider.cancelPaymentIntent).toHaveBeenCalledWith(`pi_${pending.id}`, "requested_by_customer");
      expect(provider.refundPayment).not.toHaveBeenCalled();
    });

    it("more than 48 h before: refunds the landlord's share, taken from the landlord", async () => {
      const confirmed = await insertBooking({ status: "CONFIRMED", startsInHours: 72 });
      const result = await cancel.cancelBookingAsClient(clientId, confirmed.id);
      const row = await reload(confirmed.id);

      expect(result.refundCents).toBe(8500);
      expect(provider.refundPayment).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 8500, funding: "LANDLORD" })
      );
      expect(row.status).toBe("CANCELLED");
      expect(row.payment?.status).toBe("PARTIALLY_REFUNDED");
      expect(row.payment?.refunds[0]).toMatchObject({ status: "SUCCEEDED", landlordReversalCents: 8500, applicationFeeRefunded: false });
      const { sumKeptAmounts } = await import("@/server/domains/payments/settled-amounts");
      // Client gets 85 €, the landlord keeps nothing, the platform keeps its 15 €.
      expect(await sumKeptAmounts({ bookingId: confirmed.id })).toEqual({ grossCents: 1500, netCents: 0, commissionCents: 1500 });
    });

    it("between 48 h and 24 h: half of the landlord's share", async () => {
      const confirmed = await insertBooking({ status: "CONFIRMED", startsInHours: 30 });
      expect((await cancel.cancelBookingAsClient(clientId, confirmed.id)).refundCents).toBe(4250);
    });

    it("less than 24 h: cancelled, nothing refunded", async () => {
      const confirmed = await insertBooking({ status: "CONFIRMED", startsInHours: 10 });
      expect((await cancel.cancelBookingAsClient(clientId, confirmed.id)).refundCents).toBe(0);
      expect(provider.refundPayment).not.toHaveBeenCalled();
      expect((await reload(confirmed.id)).status).toBe("CANCELLED");
    });

    it("another client's booking is a 404", async () => {
      const confirmed = await insertBooking({ status: "CONFIRMED", startsInHours: 72 });
      await expect(cancel.cancelBookingAsClient(otherClientId, confirmed.id)).rejects.toMatchObject({ status: 404 });
    });

    it("keeps the booking confirmed when the provider declines the refund", async () => {
      state.refundFails = "declined";
      const confirmed = await insertBooking({ status: "CONFIRMED", startsInHours: 72 });
      await expect(cancel.cancelBookingAsClient(clientId, confirmed.id)).rejects.toMatchObject({ status: 503 });
      const row = await reload(confirmed.id);
      expect(row.status).toBe("CONFIRMED");
      expect(row.cancelledAt).toBeNull();
      expect(row.payment?.refunds[0]?.status).toBe("FAILED");
    });

    it("on an ambiguous error, never refunds twice: the refund stays pending and is retried with the same key", async () => {
      state.refundFails = "timeout";
      const confirmed = await insertBooking({ status: "CONFIRMED", startsInHours: 72 });
      await cancel.cancelBookingAsClient(clientId, confirmed.id);
      let row = await reload(confirmed.id);
      expect(row.status).toBe("CANCELLED"); // not restored: money may have moved
      expect(row.payment?.refunds).toHaveLength(1);
      expect(row.payment?.refunds[0]?.status).toBe("PENDING");
      const refundId = row.payment!.refunds[0]!.id;

      // A second cancel attempt is impossible (already cancelled).
      await expect(cancel.cancelBookingAsClient(clientId, confirmed.id)).rejects.toMatchObject({ status: 409 });

      state.refundFails = false;
      await prisma.refund.update({ where: { id: refundId }, data: { createdAt: new Date(Date.now() - 15 * 60_000) } });
      const { retryUnconfirmedRefunds } = await import("@/server/domains/payments/refunds");
      provider.refundPayment.mockClear();
      await retryUnconfirmedRefunds();
      expect(provider.refundPayment).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: refundId }));
      row = await reload(confirmed.id);
      expect(row.payment?.refunds).toHaveLength(1);
      expect(row.payment?.refunds[0]?.status).toBe("SUCCEEDED");
    });

    it("refuses a free cancellation while the landlord is accepting (capture in flight)", async () => {
      const pending = await insertBooking({ status: "PENDING", startsInHours: 100 });
      provider.capturePaymentIntent.mockResolvedValueOnce({ outcome: "processing" }); // Stripe: webhook later
      await acceptBookingRequest(orgId, pending.id);
      await expect(cancel.cancelBookingAsClient(clientId, pending.id)).rejects.toMatchObject({ status: 409 });
      expect((await reload(pending.id)).status).toBe("PENDING");
    });

    it("keeps revenue figures right after a partial cancellation", async () => {
      const confirmed = await insertBooking({ status: "CONFIRMED", startsInHours: 30 });
      await cancel.cancelBookingAsClient(clientId, confirmed.id);
      const { sumKeptAmounts } = await import("@/server/domains/payments/settled-amounts");
      const kept = await sumKeptAmounts({ bookingId: confirmed.id });
      expect(kept).toEqual({ grossCents: 5750, netCents: 4250, commissionCents: 1500 });
    });
  });

  describe("captured safety net", () => {
    it("refunds in full a capture that lands on a booking already written off", async () => {
      const { applyPaymentOutcome } = await import("@/server/domains/payments/apply-outcome");
      const expired = await insertBooking({ status: "PENDING", startsInHours: 72 });
      // Written off (e.g. expired) while Stripe still captured it.
      await prisma.booking.update({ where: { id: expired.id }, data: { status: "REJECTED" } });
      await prisma.payment.update({ where: { bookingId: expired.id }, data: { status: "FAILED" } });

      await applyPaymentOutcome(`pi_${expired.id}`, "captured");
      const row = await reload(expired.id);
      expect(row.status).toBe("REJECTED");
      expect(provider.refundPayment).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 10000, funding: "LANDLORD_AND_FEE" })
      );
      expect(row.payment?.status).toBe("REFUNDED");
      expect(emails.sendBookingConfirmed).not.toHaveBeenCalled();
    });

    it("does nothing on a duplicate 'succeeded' for a live confirmed booking", async () => {
      const { applyPaymentOutcome } = await import("@/server/domains/payments/apply-outcome");
      const confirmed = await insertBooking({ status: "CONFIRMED", startsInHours: 72 });
      await applyPaymentOutcome(`pi_${confirmed.id}`, "captured");
      expect(provider.refundPayment).not.toHaveBeenCalled();
    });
  });

  describe("landlord cancellation", () => {
    it("refunds the client in full, commission included", async () => {
      const confirmed = await insertBooking({ status: "CONFIRMED", startsInHours: 72 });
      const result = await cancel.cancelBookingAsLandlord(orgId, landlordUserId, confirmed.id);
      const row = await reload(confirmed.id);

      expect(result.refundCents).toBe(10000);
      expect(provider.refundPayment).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 10000, funding: "LANDLORD_AND_FEE" })
      );
      expect(row).toMatchObject({ status: "CANCELLED", cancelledBy: "LANDLORD" });
      expect(row.payment?.status).toBe("REFUNDED");
      // The landlord gives back their share; the platform its commission.
      expect(row.payment?.refunds[0]).toMatchObject({ landlordReversalCents: 8500, applicationFeeRefunded: true });
      const { sumKeptAmounts } = await import("@/server/domains/payments/settled-amounts");
      expect(await sumKeptAmounts({ bookingId: confirmed.id })).toEqual({ grossCents: 0, netCents: 0, commissionCents: 0 });
    });

    it("a pending request must be refused, not cancelled", async () => {
      const pending = await insertBooking({ status: "PENDING", startsInHours: 72 });
      await expect(cancel.cancelBookingAsLandlord(orgId, landlordUserId, pending.id)).rejects.toMatchObject({ status: 409 });
    });
  });

  describe("dispute refunds", () => {
    async function disputeOn(bookingId: string) {
      return prisma.dispute.create({ data: { bookingId, raisedByUserId: clientId, description: "Non conforme" } });
    }

    it("a full refund returns the commission; a partial one is borne by the landlord", async () => {
      const full = await insertBooking({ status: "CONFIRMED", startsInHours: -5, endsInHours: -4 });
      await resolveDispute({ disputeId: (await disputeOn(full.id)).id, actorUserId: landlordUserId, outcome: "REFUND", notes: "Total" });
      expect(provider.refundPayment).toHaveBeenLastCalledWith(expect.objectContaining({ amountCents: 10000, funding: "LANDLORD_AND_FEE" }));

      const partial = await insertBooking({ status: "CONFIRMED", startsInHours: -5, endsInHours: -4 });
      await resolveDispute({
        disputeId: (await disputeOn(partial.id)).id,
        actorUserId: landlordUserId,
        outcome: "REFUND",
        notes: "Partiel",
        refundAmountCents: 3000,
      });
      expect(provider.refundPayment).toHaveBeenLastCalledWith(expect.objectContaining({ amountCents: 3000, funding: "LANDLORD" }));
    });

    it("refuses an amount between the landlord's share and the total, changing nothing", async () => {
      const booking = await insertBooking({ status: "CONFIRMED", startsInHours: -5, endsInHours: -4 });
      const dispute = await disputeOn(booking.id);
      await expect(
        resolveDispute({ disputeId: dispute.id, actorUserId: landlordUserId, outcome: "REFUND", notes: "x", refundAmountCents: 9000 })
      ).rejects.toMatchObject({ status: 400 });
      expect((await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status).toBe("OPEN");
      expect(provider.refundPayment).not.toHaveBeenCalled();
    });

    it("gives the dispute back to the admin when the refund is declined", async () => {
      state.refundFails = "declined";
      const booking = await insertBooking({ status: "CONFIRMED", startsInHours: -5, endsInHours: -4 });
      const dispute = await disputeOn(booking.id);
      await expect(
        resolveDispute({ disputeId: dispute.id, actorUserId: landlordUserId, outcome: "REFUND", notes: "x" })
      ).rejects.toMatchObject({ status: 503 });
      expect((await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status).toBe("OPEN");
    });

    it("never refunds a payment that was not captured", async () => {
      const pending = await insertBooking({ status: "PENDING", startsInHours: 72 });
      const dispute = await disputeOn(pending.id);
      await expect(
        resolveDispute({ disputeId: dispute.id, actorUserId: landlordUserId, outcome: "REFUND", notes: "x" })
      ).rejects.toMatchObject({ status: 409 });
      expect(provider.refundPayment).not.toHaveBeenCalled();
    });
  });
});
