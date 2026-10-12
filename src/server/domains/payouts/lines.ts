import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { logEvent } from "@/server/lib/logger";
import { earningEligibleAt } from "./schedule";

/** Dispute states that hold a landlord's money back until they are settled. */
export const OPEN_DISPUTE_STATUSES = ["OPEN", "INVESTIGATING", "ESCALATED"] as const;
export const OPEN_STRIPE_DISPUTE_STATUSES = ["WARNING_NEEDS_RESPONSE", "WARNING_UNDER_REVIEW", "NEEDS_RESPONSE", "UNDER_REVIEW"] as const;

/** Only bookings that ended recently are looked at, so the scan stays small. */
const LOOKBACK_DAYS = 120;

/**
 * Turns finished bookings into earnings the landlord can be paid.
 *
 * An earning is the landlord's share of the money the platform kept: the
 * net amount of the payment minus what refunds took out of it. It exists:
 *  - for a COMPLETED booking, once the stay is over (payable after the
 *    dispute window);
 *  - for a CANCELLED booking that still carries a share (a client who
 *    cancelled inside the cancellation window), payable right away.
 * A booking with nothing left (refunded in full, or outside the window) has
 * no earning. A booking under dispute waits.
 *
 * Idempotent: the unique key (bookingId, kind) makes a second run a no-op.
 */
export async function syncEarningLines(now: Date = new Date()) {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const payments = await prisma.payment.findMany({
    where: {
      status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] },
      booking: {
        payoutLines: { none: { kind: "EARNING" } },
        OR: [
          { status: "COMPLETED", endsAt: { lte: now, gte: since } },
          { status: "CANCELLED", cancelledAt: { not: null, gte: since } },
        ],
        disputes: { none: { status: { in: [...OPEN_DISPUTE_STATUSES] } } },
      },
      stripeDisputes: { none: { status: { in: [...OPEN_STRIPE_DISPUTE_STATUSES] } } },
    },
    include: {
      booking: { select: { id: true, organizationId: true, status: true, endsAt: true, cancelledAt: true } },
      refunds: { where: { status: { in: ["PENDING", "SUCCEEDED"] } }, select: { status: true, landlordReversalCents: true } },
    },
  });

  let created = 0;
  for (const payment of payments) {
    // A refund still in flight may change what the landlord keeps: wait.
    if (payment.refunds.some((refund) => refund.status === "PENDING")) continue;
    const reversed = payment.refunds.reduce((sum, refund) => sum + refund.landlordReversalCents, 0);
    const earned = payment.netAmountCents - reversed;
    if (earned <= 0) continue;

    const { booking } = payment;
    const eligibleAt =
      booking.status === "COMPLETED" ? earningEligibleAt(booking.endsAt) : (booking.cancelledAt ?? now);
    try {
      await prisma.payoutLine.create({
        data: {
          organizationId: booking.organizationId,
          bookingId: booking.id,
          kind: "EARNING",
          amountCents: earned,
          eligibleAt,
        },
      });
      created += 1;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  if (created > 0) logEvent({ event: "payout.earnings_synced", created });
  return { candidates: payments.length, created };
}

/** The commission a landlord owes after cancelling inside the cancellation
 * window: a negative line, deducted from the next payout (and carried over
 * while the balance does not cover it). Idempotent per booking. */
export async function recordCancellationPenalty(params: {
  organizationId: string;
  bookingId: string;
  amountCents: number;
}) {
  if (params.amountCents <= 0) return null;
  try {
    return await prisma.payoutLine.create({
      data: {
        organizationId: params.organizationId,
        bookingId: params.bookingId,
        kind: "CANCELLATION_PENALTY",
        amountCents: -params.amountCents,
        eligibleAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}
