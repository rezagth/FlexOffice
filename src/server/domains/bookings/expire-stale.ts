import { prisma } from "@/server/db/prisma";
import { logError, logEvent } from "@/server/lib/logger";
import { recordAudit } from "@/server/lib/audit";
import { getPaymentProvider } from "@/server/domains/payments/get-payment-provider";
import { applyPaymentOutcome } from "@/server/domains/payments/apply-outcome";

/**
 * Not specified anywhere in the source cahier des charges or rapport
 * projet — a PENDING request blocks the slot (the EXCLUDE constraint
 * applies to PENDING and CONFIRMED alike) and, on real Stripe, holds the
 * client's card authorization indefinitely if a partner never responds.
 * 48h is a reasonable MVP default, not a validated product decision;
 * adjust this constant with the team rather than treating it as final.
 */
export const BOOKING_EXPIRY_HOURS = 48;

/** Cancels PENDING requests older than BOOKING_EXPIRY_HOURS. Reuses the
 * REJECTED status (no new BookingStatus enum value — see plan) with an
 * audit trail marking it as an automatic expiry rather than a partner
 * decision. */
export async function expireStaleBookingRequests() {
  const cutoff = new Date(Date.now() - BOOKING_EXPIRY_HOURS * 60 * 60 * 1000);
  const stale = await prisma.booking.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    include: { payment: true },
  });

  let expired = 0;
  for (const booking of stale) {
    if (!booking.payment) continue;
    try {
      const provider = getPaymentProvider();
      const result = await provider.cancelPaymentIntent(booking.payment.providerPaymentIntentId);
      if (result.outcome === "succeeded") {
        await applyPaymentOutcome(booking.payment.providerPaymentIntentId, "canceled");
        await recordAudit({
          event: "booking.auto_expired",
          organizationId: booking.organizationId,
          metadata: { bookingId: booking.id, reason: "auto_expired" },
        });
        expired += 1;
      }
    } catch (error) {
      logError({ event: "booking.expire_failed", error, booking_id: booking.id });
    }
  }

  logEvent({ event: "booking.expire_run", candidates: stale.length, expired });
  return { candidates: stale.length, expired };
}
