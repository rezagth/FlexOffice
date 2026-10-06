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
  // PENDING implies an authorized card since 06/10/2026 (payment-holds.ts);
  // checked anyway so a capture is never attempted on an unauthorized intent.
  if (booking.payment.status !== "REQUIRES_CAPTURE") {
    throw new ConflictError("Le paiement de cette demande n'est pas encore autorisé.");
  }
  return booking;
}

/**
 * Claims a PENDING request for this answer: sets respondedAt, only if no
 * one answered (or cancelled, or expired) it already. The claim comes
 * before any money moves: once a capture is in flight the client can no
 * longer cancel it "for free" (bookings/cancel.ts), and the expiry job
 * leaves it alone.
 */
async function claimRequest(bookingId: string) {
  const claimed = await prisma.booking.updateMany({
    where: { id: bookingId, status: "PENDING", respondedAt: null },
    data: { respondedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new ConflictError("This booking request has already been handled");
  }
}

async function releaseClaim(bookingId: string) {
  await prisma.booking.updateMany({
    where: { id: bookingId, status: "PENDING" },
    data: { respondedAt: null },
  });
}

/**
 * Partner accepts a PENDING request: captures the authorized payment.
 * For the mock provider (its own authority, no webhook to wait for) this
 * finalizes the booking synchronously via applyPaymentOutcome. For Stripe,
 * capturePaymentIntent() only ever returns "processing" — the booking
 * stays PENDING (claimed) until the real payment_intent.succeeded webhook.
 */
export async function acceptBookingRequest(organizationId: string, bookingId: string) {
  const booking = await loadPendingRequest(organizationId, bookingId);
  // Accepting after the slot has started would charge the client for time
  // already gone; the request expires instead (expire-stale.ts).
  if (booking.startsAt.getTime() <= Date.now()) {
    throw new ConflictError("Ce créneau a déjà commencé : la demande ne peut plus être acceptée.");
  }
  await claimRequest(booking.id);

  const provider = getPaymentProvider();
  let result;
  try {
    result = await provider.capturePaymentIntent(booking.payment!.providerPaymentIntentId);
  } catch (error) {
    // Nothing captured: the request is open again.
    await releaseClaim(booking.id);
    throw error;
  }
  if (result.outcome === "succeeded") {
    await applyPaymentOutcome(booking.payment!.providerPaymentIntentId, "captured");
  }
  return { pending: result.outcome === "processing" };
}

/** Partner rejects a PENDING request: releases the authorization. Same
 * synchronous-mock / async-stripe split as acceptBookingRequest. */
export async function rejectBookingRequest(organizationId: string, bookingId: string) {
  const booking = await loadPendingRequest(organizationId, bookingId);
  await claimRequest(booking.id);
  const provider = getPaymentProvider();
  let result;
  try {
    result = await provider.cancelPaymentIntent(booking.payment!.providerPaymentIntentId, "declined");
  } catch (error) {
    await releaseClaim(booking.id);
    throw error;
  }
  if (result.outcome === "succeeded") {
    await applyPaymentOutcome(booking.payment!.providerPaymentIntentId, "canceled", "declined");
  }
  return { pending: result.outcome === "processing" };
}
