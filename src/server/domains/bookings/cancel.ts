import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { logError } from "@/server/lib/logger";
import {
  cancellationWindowLabel,
  clientCancellationRefund,
  landlordCancellationPenaltyCents,
} from "@/lib/cancellation-policy";
import { recordCancellationPenalty } from "@/server/domains/payouts/lines";
import { getPaymentProvider } from "@/server/domains/payments/get-payment-provider";
import { issueRefund } from "@/server/domains/payments/refunds";
import {
  sendBookingCancelledByClient,
  sendBookingCancelledByLandlord,
} from "@/server/domains/notifications/send-booking-emails";
import type { CancellationEmailContext } from "@/server/domains/notifications/templates";

/**
 * Booking cancellation (audit B-04: CANCELLED existed but was never written,
 * while the CGV promised cancellation to both parties).
 *
 * The booking is always claimed first with a conditional update (so a
 * concurrent accept, cancel or expiry cannot also act on it), then the
 * money moves — and if the refund fails, the claim is undone so the
 * booking never ends up cancelled without its refund.
 */

const bookingForCancellation = {
  include: { payment: true, space: true, organization: true, clientUser: true },
} as const;

type BookingForCancellation = NonNullable<
  Awaited<ReturnType<typeof loadForClient>>
>;

async function loadForClient(clientUserId: string, bookingId: string) {
  return prisma.booking.findFirst({ where: { id: bookingId, clientUserId }, ...bookingForCancellation });
}

function emailContext(
  booking: BookingForCancellation,
  refundAmountCents: number,
  beforeCapture: boolean
): CancellationEmailContext {
  return {
    clientEmail: booking.clientUser.email,
    clientName: booking.clientUser.name,
    partnerEmail: booking.organization.email,
    partnerOrgName: booking.organization.name,
    spaceName: booking.space.name,
    spaceAddress: booking.space.address,
    spaceCity: booking.space.city,
    spacePostalCode: booking.space.postalCode,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    priceAmountCents: booking.priceAmountCents,
    refundAmountCents,
    beforeCapture,
  };
}

/** Releases an authorization that was never captured. Best effort after the
 * database already says CANCELLED: a failure here is logged, and Stripe
 * releases an uncaptured authorization on its own after 7 days anyway. */
async function releaseAuthorization(booking: BookingForCancellation) {
  if (!booking.payment) return;
  await prisma.payment.updateMany({
    where: { id: booking.payment.id, status: { in: ["AWAITING_AUTHORIZATION", "REQUIRES_CAPTURE"] } },
    data: { status: "FAILED" },
  });
  try {
    await getPaymentProvider().cancelPaymentIntent(booking.payment.providerPaymentIntentId, "requested_by_customer");
  } catch (error) {
    logError({ event: "booking.cancel_release_failed", error, booking_id: booking.id });
  }
}

export async function cancelBookingAsClient(clientUserId: string, bookingId: string) {
  const booking = await loadForClient(clientUserId, bookingId);
  if (!booking) throw new NotFoundError("Réservation introuvable.");

  // Not accepted yet: free, nothing was charged.
  if (booking.status === "AWAITING_PAYMENT" || booking.status === "PENDING") {
    // respondedAt set = the landlord is accepting it right now (capture in
    // flight, see accept-reject.ts): too late for a free cancellation.
    const claimed = await prisma.booking.updateMany({
      where: { id: booking.id, status: booking.status, respondedAt: null },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "CLIENT" },
    });
    if (claimed.count === 0) {
      throw new ConflictError(
        "Cette demande est en cours de traitement par l'hôte. Rechargez la page dans quelques instants."
      );
    }
    await releaseAuthorization(booking);
    await recordAudit({
      event: "booking.cancelled_by_client",
      actorUserId: clientUserId,
      organizationId: booking.organizationId,
      metadata: { bookingId: booking.id, beforeCapture: true, refundCents: 0 },
    });
    // The landlord never saw a request still in the card step.
    if (booking.status === "PENDING") await sendBookingCancelledByClient(emailContext(booking, 0, true));
    return { status: "CANCELLED" as const, refundCents: 0 };
  }

  if (booking.status !== "CONFIRMED") {
    throw new ConflictError("Cette réservation ne peut plus être annulée.");
  }
  if (booking.startsAt.getTime() <= Date.now()) {
    throw new ConflictError("Ce créneau a déjà commencé : la réservation ne peut plus être annulée.");
  }
  if (!booking.payment) throw new ConflictError("Aucun paiement associé à cette réservation.");

  const { refundCents, tier } = clientCancellationRefund({
    priceAmountCents: booking.priceAmountCents,
    commissionAmountCents: booking.commissionAmountCents,
    startsAt: booking.startsAt,
    cancellationWindowHours: booking.cancellationWindowHours,
  });

  const claimed = await prisma.booking.updateMany({
    where: { id: booking.id, status: "CONFIRMED" },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "CLIENT" },
  });
  if (claimed.count === 0) throw new ConflictError("Cette réservation vient de changer d'état. Rechargez la page.");

  if (refundCents > 0) {
    try {
      await issueRefund({
        paymentId: booking.payment.id,
        amountCents: refundCents,
        funding: "LANDLORD",
        reason: `Annulation par le client (${
          tier === "FULL"
            ? "hors délai d'annulation"
            : `à moins de ${cancellationWindowLabel(booking.cancellationWindowHours)} du début : 50 %`
        })`,
        actorUserId: clientUserId,
      });
    } catch (error) {
      await restoreConfirmed(booking.id);
      throw error;
    }
  }

  await recordAudit({
    event: "booking.cancelled_by_client",
    actorUserId: clientUserId,
    organizationId: booking.organizationId,
    metadata: { bookingId: booking.id, beforeCapture: false, tier, refundCents },
  });
  await sendBookingCancelledByClient(emailContext(booking, refundCents, false));
  return { status: "CANCELLED" as const, refundCents };
}

export async function cancelBookingAsLandlord(organizationId: string, actorUserId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, organizationId },
    ...bookingForCancellation,
  });
  if (!booking) throw new NotFoundError("Réservation introuvable.");

  if (booking.status === "PENDING") {
    throw new ConflictError("Cette demande n'est pas encore acceptée : refusez-la plutôt que de l'annuler.");
  }
  if (booking.status !== "CONFIRMED") {
    throw new ConflictError("Cette réservation ne peut plus être annulée.");
  }
  if (booking.startsAt.getTime() <= Date.now()) {
    throw new ConflictError("Ce créneau a déjà commencé : la réservation ne peut plus être annulée.");
  }
  if (!booking.payment) throw new ConflictError("Aucun paiement associé à cette réservation.");
  if (booking.payment.status !== "SUCCEEDED") {
    throw new ConflictError("Un remboursement a déjà été émis sur cette réservation : contactez le support.");
  }

  const claimed = await prisma.booking.updateMany({
    where: { id: booking.id, status: "CONFIRMED" },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "LANDLORD" },
  });
  if (claimed.count === 0) throw new ConflictError("Cette réservation vient de changer d'état. Rechargez la page.");

  // The client gets everything back, commission included (decided
  // 06/10/2026); inside the cancellation window the landlord then owes that
  // commission (decided 10/10/2026, see the penalty below).
  try {
    await issueRefund({
      paymentId: booking.payment.id,
      amountCents: booking.payment.amountCents,
      funding: "LANDLORD_AND_FEE",
      reason: "Annulation par l'entreprise hôte",
      actorUserId,
    });
  } catch (error) {
    await restoreConfirmed(booking.id);
    throw error;
  }

  // Inside the cancellation window the landlord owes the commission the
  // platform gave up: a negative line, deducted from their next payout.
  const penaltyCents = landlordCancellationPenaltyCents({
    commissionAmountCents: booking.commissionAmountCents,
    startsAt: booking.startsAt,
    cancellationWindowHours: booking.cancellationWindowHours,
  });
  await recordCancellationPenalty({ organizationId, bookingId: booking.id, amountCents: penaltyCents });

  await recordAudit({
    event: "booking.cancelled_by_landlord",
    actorUserId,
    organizationId,
    metadata: { bookingId: booking.id, refundCents: booking.payment.amountCents, penaltyCents },
  });
  await sendBookingCancelledByLandlord({
    ...emailContext(booking, booking.payment.amountCents, false),
    landlordPenaltyCents: penaltyCents,
  });
  return { status: "CANCELLED" as const, refundCents: booking.payment.amountCents };
}

async function restoreConfirmed(bookingId: string) {
  await prisma.booking.updateMany({
    where: { id: bookingId, status: "CANCELLED" },
    data: { status: "CONFIRMED", cancelledAt: null, cancelledBy: null },
  });
}
