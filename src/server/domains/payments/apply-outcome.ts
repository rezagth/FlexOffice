import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { logError, logEvent } from "@/server/lib/logger";
import {
  sendBookingConfirmed,
  sendBookingExpired,
  sendBookingRejected,
} from "@/server/domains/notifications/send-booking-emails";
import type { BookingEmailContext } from "@/server/domains/notifications/templates";
import type { CancellationReason } from "./provider";
import { issueRefund } from "./refunds";
import { issueInvoiceDocumentsSafely } from "@/server/domains/invoicing/issue";

export type PaymentOutcome = "captured" | "canceled" | "failed";

const paymentWithBooking = {
  include: {
    booking: {
      include: { space: true, organization: true, clientUser: true },
    },
  },
} satisfies Prisma.PaymentDefaultArgs;
type PaymentWithBooking = Prisma.PaymentGetPayload<typeof paymentWithBooking>;

/**
 * The single place that turns a payment-provider outcome into a
 * Booking/Payment state change. Called both by the Stripe webhook handler
 * (real provider — the only source of truth for a "succeeded" state) and,
 * for the mock provider only, directly from the accept/reject booking
 * actions (the mock has no external system to wait on, see provider.ts).
 *
 * Every transition is conditional on the current status
 * (`updateMany` + checking `count`), so replaying the same event twice —
 * a retried webhook delivery, a double-click — is a no-op the second time,
 * never a double email or a double audit entry.
 */
export async function applyPaymentOutcome(
  providerPaymentIntentId: string,
  outcome: PaymentOutcome,
  cancellationReason?: CancellationReason | null
) {
  const payment = await prisma.payment.findUnique({
    where: { providerPaymentIntentId },
    ...paymentWithBooking,
  });

  if (!payment) {
    // A webhook can legitimately arrive for an intent this app never
    // created (a stale test event, a different integration) — log and
    // move on rather than throw, so the webhook route still returns 200.
    logEvent({
      event: "payment.outcome_unknown_intent",
      provider_payment_intent_id: providerPaymentIntentId,
      outcome,
    });
    return;
  }

  if (outcome === "captured") {
    const result = await finalize(payment, "SUCCEEDED", "CONFIRMED", () =>
      sendBookingConfirmed(emailContext(payment))
    );
    if (result !== "applied") await refundOrphanCapture(payment, result);
    return;
  }

  // "canceled" and "failed" both mean no capture happened — same terminal
  // state for Booking/Payment, distinguished only in the audit metadata and
  // in the e-mail: an expiry ("abandoned") is not a landlord refusal.
  const notify =
    cancellationReason === "abandoned"
      ? () => sendBookingExpired(emailContext(payment))
      : () => sendBookingRejected(emailContext(payment));
  await finalize(payment, "FAILED", "REJECTED", notify, cancellationReason ?? outcome);
}

async function finalize(
  payment: PaymentWithBooking,
  paymentStatus: "SUCCEEDED" | "FAILED",
  bookingStatus: "CONFIRMED" | "REJECTED",
  notify: () => Promise<void>,
  reason?: string
) {
  // Only an authorized payment (REQUIRES_CAPTURE) is finalized here. A
  // `payment_failed` during the card step (AWAITING_AUTHORIZATION) is not
  // terminal — the client can retry with another card; abandoned card
  // steps are released by bookings/payment-holds.ts.
  const paymentUpdate = await prisma.payment.updateMany({
    where: { id: payment.id, status: "REQUIRES_CAPTURE" },
    data: {
      status: paymentStatus,
      ...(paymentStatus === "SUCCEEDED" ? { capturedAt: new Date() } : {}),
    },
  });

  if (paymentUpdate.count === 0) {
    // Already applied (retried webhook, or the mock path beat the real
    // one to it) — idempotent no-op, not an error.
    logEvent({ event: "payment.outcome_already_applied", payment_id: payment.id, outcome: paymentStatus });
    return "payment_not_awaiting_capture" as const;
  }

  // Money was taken: the booking invoice is issued now (numbered at
  // capture, lot F). Never throws; the maintenance sweep catches up.
  if (paymentStatus === "SUCCEEDED") await issueInvoiceDocumentsSafely(payment.id);

  const bookingUpdate = await prisma.booking.updateMany({
    where: { id: payment.bookingId, status: "PENDING" },
    data: { status: bookingStatus },
  });

  // The booking may already have left PENDING through another path — the
  // client cancelled it (bookings/cancel.ts sends its own e-mails), or it
  // was released. Then this event only settles the payment: no audit entry
  // or e-mail claiming a transition that did not happen here.
  if (bookingUpdate.count === 0) {
    logEvent({ event: "payment.outcome_booking_already_left_pending", payment_id: payment.id, outcome: paymentStatus });
    return "booking_left_pending" as const;
  }

  await recordAudit({
    event: bookingStatus === "CONFIRMED" ? "booking.confirmed" : "booking.rejected",
    organizationId: payment.organizationId,
    metadata: { bookingId: payment.bookingId, ...(reason ? { reason } : {}) },
  });

  await notify();
  return "applied" as const;
}

/**
 * Safety net: Stripe captured money for a booking we no longer consider
 * live — it was cancelled or expired while the capture was in flight
 * (accept-reject.ts claims requests to make this rare, not impossible).
 * Keeping the money would charge a client for a cancelled booking, so the
 * capture is recorded and refunded in full, and the incident is logged at
 * error level for follow-up.
 */
async function refundOrphanCapture(
  payment: PaymentWithBooking,
  reason: "payment_not_awaiting_capture" | "booking_left_pending"
) {
  const current = await prisma.payment.findUnique({ where: { id: payment.id }, include: { booking: true } });
  if (!current) return;
  const bookingDead = ["CANCELLED", "REJECTED"].includes(current.booking.status);

  if (reason === "payment_not_awaiting_capture") {
    // Duplicate "succeeded" webhooks land here too: only act when we had
    // written the payment off (FAILED) while Stripe captured it.
    if (current.status !== "FAILED") return;
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "FAILED" },
      data: { status: "SUCCEEDED", capturedAt: new Date() },
    });
  } else if (!bookingDead) {
    return;
  }

  logError({
    event: "payment.orphan_capture_refunded",
    error: new Error("Captured payment for a booking that is no longer live; refunding in full."),
    payment_id: payment.id,
    booking_id: payment.bookingId,
    booking_status: current.booking.status,
  });
  await issueRefund({
    paymentId: payment.id,
    amountCents: payment.amountCents,
    funding: "LANDLORD_AND_FEE",
    reason: "Capture tardive sur une réservation annulée ou expirée",
  });
}

/** E-mail context for a payment's booking — shared with the other booking
 * lifecycle modules (payment holds, cancellation). */
export function bookingEmailContextForPayment(payment: PaymentWithBooking): BookingEmailContext {
  return emailContext(payment);
}

export { paymentWithBooking };
export type { PaymentWithBooking };

function emailContext(payment: PaymentWithBooking): BookingEmailContext {
  const { booking } = payment;
  return {
    clientEmail: booking.clientUser.email,
    clientName: booking.clientUser.name,
    partnerEmail: booking.organization.email,
    partnerOrgName: booking.organization.name,
    spaceName: booking.space.name,
    spaceAddress: booking.space.address,
    spaceCity: booking.space.city,
    spacePostalCode: booking.space.postalCode,
    accessInstructions: booking.space.accessInstructions,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    priceAmountCents: booking.priceAmountCents,
  };
}
