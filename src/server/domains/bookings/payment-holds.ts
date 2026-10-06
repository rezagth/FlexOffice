import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { logError, logEvent } from "@/server/lib/logger";
import { getPaymentProvider } from "@/server/domains/payments/get-payment-provider";
import {
  bookingEmailContextForPayment,
  paymentWithBooking,
} from "@/server/domains/payments/apply-outcome";
import {
  sendBookingRequested,
  sendBookingRequestReceived,
} from "@/server/domains/notifications/send-booking-emails";

/**
 * The card step (real Stripe only).
 *
 * A booking is created in AWAITING_PAYMENT: its slot is held by
 * bookings_no_overlap_excl so two clients cannot pay for the same slot,
 * but the landlord does not see it and nobody is e-mailed. It becomes a
 * real request (PENDING) only when Stripe confirms the card is authorized
 * — `payment_intent.amount_capturable_updated`, through the verified
 * webhook. Before 06/10/2026 the request was PENDING and announced to the
 * landlord before any card was entered, so anyone could hold every slot of
 * the catalogue for 48 h without paying (audit B-03).
 *
 * A hold the client never completes is released after PAYMENT_HOLD_MINUTES,
 * both lazily (before any new booking on the same space, so the slot frees
 * up immediately) and by the scheduled job (expire-stale.ts).
 */
export const PAYMENT_HOLD_MINUTES = 15;

/** At most this many open requests (card step or waiting for a landlord)
 * per client — one account cannot hold a large part of the catalogue even
 * within the hold window. */
export const MAX_OPEN_REQUESTS_PER_CLIENT = 5;

/**
 * Releases card steps older than PAYMENT_HOLD_MINUTES. The database is
 * updated first, so the slot is free as soon as this returns; the Stripe
 * intent is cancelled afterwards, best effort — if the client still
 * manages to authorize it, applyAuthorization() sees the booking is gone
 * and cancels the intent then.
 */
export async function releaseAbandonedPaymentHolds(filter: { spaceId?: string } = {}) {
  const cutoff = new Date(Date.now() - PAYMENT_HOLD_MINUTES * 60 * 1000);
  const abandoned = await prisma.booking.findMany({
    where: {
      status: "AWAITING_PAYMENT",
      createdAt: { lt: cutoff },
      ...(filter.spaceId ? { spaceId: filter.spaceId } : {}),
    },
    include: { payment: true },
  });

  let released = 0;
  for (const booking of abandoned) {
    const updated = await prisma.booking.updateMany({
      where: { id: booking.id, status: "AWAITING_PAYMENT" },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "SYSTEM" },
    });
    if (updated.count === 0) continue; // authorized or released concurrently
    released += 1;

    await recordAudit({
      event: "booking.payment_hold_released",
      organizationId: booking.organizationId,
      metadata: { bookingId: booking.id },
    });

    if (!booking.payment) continue;
    await prisma.payment.updateMany({
      where: { id: booking.payment.id, status: "AWAITING_AUTHORIZATION" },
      data: { status: "FAILED" },
    });
    try {
      await getPaymentProvider().cancelPaymentIntent(booking.payment.providerPaymentIntentId, "abandoned");
    } catch (error) {
      // Typically "already canceled" — harmless. Anything else is logged;
      // a late authorization is still caught by applyAuthorization().
      logError({ event: "booking.payment_hold_cancel_failed", error, booking_id: booking.id });
    }
  }

  if (abandoned.length > 0) {
    logEvent({ event: "booking.payment_holds_released", candidates: abandoned.length, released });
  }
  return { candidates: abandoned.length, released };
}

/**
 * Stripe confirmed the card is authorized for this intent
 * (`payment_intent.amount_capturable_updated`). Turns the hold into a real
 * request and announces it — idempotent, conditional on current states.
 *
 * If the hold was already released (the client took too long), the
 * authorization is cancelled at once so no money stays blocked on a card
 * for a booking that no longer exists.
 */
export async function applyAuthorization(providerPaymentIntentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { providerPaymentIntentId },
    ...paymentWithBooking,
  });
  if (!payment) {
    logEvent({ event: "payment.authorization_unknown_intent", provider_payment_intent_id: providerPaymentIntentId });
    return;
  }

  const paymentUpdate = await prisma.payment.updateMany({
    where: { id: payment.id, status: "AWAITING_AUTHORIZATION" },
    data: { status: "REQUIRES_CAPTURE" },
  });
  if (paymentUpdate.count === 0) {
    if (payment.status === "FAILED" && payment.booking.status === "CANCELLED") {
      await cancelLateAuthorization(providerPaymentIntentId, payment.bookingId);
    } else {
      logEvent({ event: "payment.authorization_already_applied", payment_id: payment.id });
    }
    return;
  }

  const bookingUpdate = await prisma.booking.updateMany({
    where: { id: payment.bookingId, status: "AWAITING_PAYMENT" },
    data: { status: "PENDING" },
  });
  if (bookingUpdate.count === 0) {
    // Released between the two updates: undo and release the card.
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "REQUIRES_CAPTURE" },
      data: { status: "FAILED" },
    });
    await cancelLateAuthorization(providerPaymentIntentId, payment.bookingId);
    return;
  }

  await recordAudit({
    event: "booking.requested",
    actorUserId: payment.booking.clientUserId,
    organizationId: payment.organizationId,
    metadata: { bookingId: payment.bookingId },
  });

  const ctx = bookingEmailContextForPayment(payment);
  await sendBookingRequested(ctx);
  await sendBookingRequestReceived(ctx);
}

async function cancelLateAuthorization(providerPaymentIntentId: string, bookingId: string) {
  logEvent({ event: "payment.late_authorization_cancelled", booking_id: bookingId });
  try {
    await getPaymentProvider().cancelPaymentIntent(providerPaymentIntentId, "abandoned");
  } catch (error) {
    logError({ event: "payment.late_authorization_cancel_failed", error, booking_id: bookingId });
  }
}
