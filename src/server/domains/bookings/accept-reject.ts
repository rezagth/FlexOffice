import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { getPaymentProvider } from "@/server/domains/payments/get-payment-provider";
import { applyPaymentOutcome } from "@/server/domains/payments/apply-outcome";

/** Loads a PENDING booking's payment, scoped to the acting organization —
 * an organization that doesn't own the booking gets 404, never 403 (a 403
 * would confirm the booking exists). Any other status is a 409: the
 * request was already accepted, rejected, or expired. */
async function loadPendingRequest(organizationId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, organizationId },
    include: { payment: true },
  });
  if (!booking) throw new NotFoundError("Booking request not found");
  if (booking.status !== "PENDING" || !booking.payment) {
    throw new ConflictError("This booking request has already been handled");
  }
  return booking;
}

/**
 * Partner accepts a PENDING request: captures the authorized payment.
 * For the mock provider (its own authority, no webhook to wait for) this
 * finalizes the booking synchronously via applyPaymentOutcome. For Stripe,
 * capturePaymentIntent() only ever returns "processing" — the booking
 * stays PENDING until the real payment_intent.succeeded webhook arrives.
 */
export async function acceptBookingRequest(organizationId: string, bookingId: string) {
  const booking = await loadPendingRequest(organizationId, bookingId);
  const provider = getPaymentProvider();
  const result = await provider.capturePaymentIntent(booking.payment!.providerPaymentIntentId);
  if (result.outcome === "succeeded") {
    await applyPaymentOutcome(booking.payment!.providerPaymentIntentId, "captured");
  }
  return { pending: result.outcome === "processing" };
}

/** Partner rejects a PENDING request: releases the authorization. Same
 * synchronous-mock / async-stripe split as acceptBookingRequest. */
export async function rejectBookingRequest(organizationId: string, bookingId: string) {
  const booking = await loadPendingRequest(organizationId, bookingId);
  const provider = getPaymentProvider();
  const result = await provider.cancelPaymentIntent(booking.payment!.providerPaymentIntentId);
  if (result.outcome === "succeeded") {
    await applyPaymentOutcome(booking.payment!.providerPaymentIntentId, "canceled");
  }
  return { pending: result.outcome === "processing" };
}
