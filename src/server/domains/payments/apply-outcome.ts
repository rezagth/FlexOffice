import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { logEvent } from "@/server/lib/logger";
import {
  sendBookingConfirmed,
  sendBookingRejected,
} from "@/server/domains/notifications/send-booking-emails";
import type { BookingEmailContext } from "@/server/domains/notifications/templates";

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
export async function applyPaymentOutcome(providerPaymentIntentId: string, outcome: PaymentOutcome) {
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
    await finalize(payment, "SUCCEEDED", "CONFIRMED", () => sendBookingConfirmed(emailContext(payment)));
    return;
  }

  // "canceled" and "failed" both mean no capture happened — same terminal
  // state for Booking/Payment, distinguished only in the audit metadata.
  await finalize(payment, "FAILED", "REJECTED", () => sendBookingRejected(emailContext(payment)), outcome);
}

async function finalize(
  payment: PaymentWithBooking,
  paymentStatus: "SUCCEEDED" | "FAILED",
  bookingStatus: "CONFIRMED" | "REJECTED",
  notify: () => Promise<void>,
  reason?: string
) {
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
    return;
  }

  await prisma.booking.updateMany({
    where: { id: payment.bookingId, status: "PENDING" },
    data: { status: bookingStatus },
  });

  await recordAudit({
    event: bookingStatus === "CONFIRMED" ? "booking.confirmed" : "booking.rejected",
    organizationId: payment.organizationId,
    metadata: { bookingId: payment.bookingId, ...(reason ? { reason } : {}) },
  });

  await notify();
}

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
