import { prisma } from "@/server/db/prisma";
import { logError, logEvent } from "@/server/lib/logger";
import { recordAudit } from "@/server/lib/audit";
import { getPaymentProvider } from "@/server/domains/payments/get-payment-provider";
import { applyPaymentOutcome } from "@/server/domains/payments/apply-outcome";
import { releaseAbandonedPaymentHolds } from "./payment-holds";
import { retryUnconfirmedRefunds } from "@/server/domains/payments/refunds";
import { purgeExpiredPersonalData } from "@/server/domains/users/retention";
import { sendDueBookingReminders } from "@/server/domains/notifications/booking-reminders";

/**
 * A request the landlord has not answered expires after this delay, or at
 * the start of the slot if that comes first — decided with the product
 * owner on 06/10/2026. A PENDING request blocks the slot (EXCLUDE
 * constraint) and holds the client's card authorization.
 */
export const BOOKING_EXPIRY_HOURS = 48;

/** When a PENDING request created at `createdAt` for a slot starting at
 * `startsAt` expires. */
export function requestExpiresAt(createdAt: Date, startsAt: Date): Date {
  const byDelay = new Date(createdAt.getTime() + BOOKING_EXPIRY_HOURS * 60 * 60 * 1000);
  return byDelay < startsAt ? byDelay : startsAt;
}

/**
 * Expires PENDING requests past requestExpiresAt(). Reuses the REJECTED
 * status with an audit entry marking it as an automatic expiry, and the
 * dedicated "expired" e-mail (cancellation reason "abandoned").
 *
 * A PENDING booking without a Payment row (left by a crash between the two
 * inserts) used to be skipped forever, keeping its slot locked; it is now
 * closed directly.
 */
export async function expireStaleBookingRequests() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - BOOKING_EXPIRY_HOURS * 60 * 60 * 1000);
  const stale = await prisma.booking.findMany({
    where: {
      status: "PENDING",
      // A request being accepted right now (capture in flight) is not stale.
      respondedAt: null,
      OR: [{ createdAt: { lt: cutoff } }, { startsAt: { lte: now } }],
    },
    include: { payment: true },
  });

  let expired = 0;
  for (const booking of stale) {
    try {
      if (!booking.payment) {
        const closed = await prisma.booking.updateMany({
          where: { id: booking.id, status: "PENDING", respondedAt: null },
          data: { status: "REJECTED" },
        });
        if (closed.count > 0) expired += 1;
      } else {
        // Not claimed on purpose (respondedAt feeds the response-time KPI,
        // an expiry is not an answer). If a landlord accepts at the very
        // same moment, Stripe refuses one of the two operations; should the
        // capture still win after the booking left PENDING, the captured
        // safety net in apply-outcome.ts refunds it.
        const provider = getPaymentProvider();
        const result = await provider.cancelPaymentIntent(booking.payment.providerPaymentIntentId, "abandoned");
        if (result.outcome === "succeeded") {
          await applyPaymentOutcome(booking.payment.providerPaymentIntentId, "canceled", "abandoned");
        }
        // Stripe: the booking moves when payment_intent.canceled arrives
        // (with cancellation_reason "abandoned"); counted as expired here.
        expired += 1;
      }
      await recordAudit({
        event: "booking.auto_expired",
        organizationId: booking.organizationId,
        metadata: { bookingId: booking.id, reason: "auto_expired" },
      });
    } catch (error) {
      logError({ event: "booking.expire_failed", error, booking_id: booking.id });
    }
  }

  logEvent({ event: "booking.expire_run", candidates: stale.length, expired });
  return { candidates: stale.length, expired };
}

/** CONFIRMED bookings whose slot has ended become COMPLETED — the status
 * was read by the dashboards but never written. */
export async function completeFinishedBookings() {
  const result = await prisma.booking.updateMany({
    where: { status: "CONFIRMED", endsAt: { lte: new Date() } },
    data: { status: "COMPLETED" },
  });
  if (result.count > 0) logEvent({ event: "booking.completed_run", completed: result.count });
  return { completed: result.count };
}

/** Everything the scheduled job does, in order. Each step is independent:
 * one failing does not stop the others. */
export async function runBookingMaintenance() {
  const holds = await releaseAbandonedPaymentHolds().catch((error) => {
    logError({ event: "booking.maintenance_holds_failed", error });
    return null;
  });
  const requests = await expireStaleBookingRequests().catch((error) => {
    logError({ event: "booking.maintenance_expire_failed", error });
    return null;
  });
  const completed = await completeFinishedBookings().catch((error) => {
    logError({ event: "booking.maintenance_complete_failed", error });
    return null;
  });
  const refunds = await retryUnconfirmedRefunds().catch((error) => {
    logError({ event: "booking.maintenance_refunds_failed", error });
    return null;
  });
  const reminders = await sendDueBookingReminders().catch((error) => {
    logError({ event: "booking.maintenance_reminders_failed", error });
    return null;
  });
  await purgeExpiredPersonalData(); // GDPR retention (SEC-10) — never throws, logs its own result.
  return { holds, requests, completed, refunds, reminders };
}
