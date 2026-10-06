import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { logError } from "@/server/lib/logger";
import { getPaymentProvider } from "@/server/domains/payments/get-payment-provider";
import { computeCommissionCents } from "@/server/domains/payments/constants";
import {
  sendBookingRequested,
  sendBookingRequestReceived,
} from "@/server/domains/notifications/send-booking-emails";
import type { BookingEmailContext } from "@/server/domains/notifications/templates";
import type { CreatePaymentIntentResult } from "@/server/domains/payments/provider";
import { computeDaySlots } from "./availability";
import { MAX_OPEN_REQUESTS_PER_CLIENT, PAYMENT_HOLD_MINUTES, releaseAbandonedPaymentHolds } from "./payment-holds";
import { assertParticipantsFitCapacity } from "./booking-invariants";
import type { CreateBookingInput } from "@/lib/validation/bookings";

// Prisma 7 + @prisma/adapter-pg surface an unmapped Postgres error (like an
// EXCLUDE constraint violation) as a generic PrismaClientKnownRequestError
// with code "P2039" and the real Postgres SQLSTATE/constraint name only in
// the message text — there is no dedicated P#### code for this, confirmed
// by reproducing the conflict against a local database rather than
// guessing (see officeflex-security-guardrails §6).
const EXCLUDE_CONSTRAINT_SQLSTATE = "23P01";
const EXCLUDE_CONSTRAINT_NAME = "bookings_no_overlap_excl";

function isBookingSlotConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    typeof error.message === "string" &&
    error.message.includes(EXCLUDE_CONSTRAINT_SQLSTATE) &&
    error.message.includes(EXCLUDE_CONSTRAINT_NAME)
  );
}

/**
 * Creates a booking request: the booking starts in AWAITING_PAYMENT and
 * becomes PENDING once the card is authorized (synchronously for the mock,
 * via the webhook for Stripe — see payment-holds.ts). Never trusts a price from the caller — the price is always the
 * space's own halfDayPriceCents/dayPriceCents for the requested slot.
 *
 * Sequencing matters: the Booking insert happens before any network call
 * to the payment provider (never hold a DB transaction open across a
 * network call), and it happens alone so the EXCLUDE constraint is the
 * very first thing that can reject the request — before any payment
 * authorization is attempted for a slot that turns out to be taken.
 */
export async function createBooking(clientUserId: string, input: CreateBookingInput) {
  const space = await prisma.space.findFirst({
    where: { id: input.spaceId, status: "PUBLISHED" },
  });
  if (!space) throw new NotFoundError("Space not found");

  // The schema bounds participantsCount to 1..1000 and nothing compared it to
  // the space, so a two-seat office could be booked and charged for 1000
  // people. Checked against the capacity read from the database, never a
  // value supplied by the caller.
  assertParticipantsFitCapacity(input.participantsCount, space.capacity);

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: space.organizationId },
  });
  const clientUser = await prisma.profile.findUniqueOrThrow({ where: { id: clientUserId } });

  const daySlots = await computeDaySlots(input.spaceId, input.date);
  if (!daySlots) throw new ConflictError("This space is closed on the requested date");

  const slot =
    input.slot === "MORNING"
      ? daySlots.morning
      : input.slot === "AFTERNOON"
        ? daySlots.afternoon
        : daySlots.fullDay;
  if (!slot) throw new ConflictError("This slot does not exist on the requested date");
  if (slot.startsAt.getTime() < Date.now()) throw new ConflictError("This slot is in the past");
  // A best-effort UX check only — two concurrent requests can both read
  // `available: true`. The EXCLUDE constraint below is the real guarantee.
  if (!slot.available) throw new ConflictError("This slot is no longer available");

  const priceAmountCents = slot.priceCents;
  const commissionAmountCents = computeCommissionCents(priceAmountCents);

  // Resolved BEFORE the booking row exists: in a misconfigured production
  // deployment getPaymentProvider() throws a 503, and a booking created
  // first would keep the slot locked by the EXCLUDE constraint — with no
  // Payment row, so nothing would ever release it.
  const provider = getPaymentProvider();

  // Never take money for a landlord who cannot be paid out (no connected
  // account, onboarding unfinished, charges or payouts disabled). Before
  // 06/10/2026 the charge went through and stayed entirely on the platform.
  await provider.assertConnectedAccountCanBeCharged(organization.stripeAccountId);

  // A landlord booking their own listing would pay themselves through the
  // platform — inflating occupancy and KPIs, and a laundering pattern.
  const isMember = await prisma.organizationMember.findFirst({
    where: { organizationId: space.organizationId, profileId: clientUserId, status: "ACTIVE" },
    select: { profileId: true },
  });
  if (isMember) {
    throw new ConflictError("Vous ne pouvez pas réserver un espace de votre propre organisation.");
  }

  // Free this space's abandoned card steps first, so a slot someone walked
  // away from is bookable right now rather than at the next scheduled run.
  await releaseAbandonedPaymentHolds({ spaceId: space.id });

  // Expired card steps (older than the hold window, not yet released by
  // the scheduled job) do not count against the client.
  const openRequests = await prisma.booking.count({
    where: {
      clientUserId,
      startsAt: { gt: new Date() },
      OR: [
        { status: "PENDING" },
        {
          status: "AWAITING_PAYMENT",
          createdAt: { gte: new Date(Date.now() - PAYMENT_HOLD_MINUTES * 60 * 1000) },
        },
      ],
    },
  });
  if (openRequests >= MAX_OPEN_REQUESTS_PER_CLIENT) {
    throw new ConflictError(
      `Vous avez déjà ${MAX_OPEN_REQUESTS_PER_CLIENT} demandes en attente. Attendez une réponse ou annulez-en une avant d'en faire une nouvelle.`
    );
  }

  // Created in AWAITING_PAYMENT: the slot is held (EXCLUDE constraint), but
  // the request is neither visible to the landlord nor announced until the
  // card is authorized — see payment-holds.ts.
  let booking;
  try {
    booking = await prisma.booking.create({
      data: {
        spaceId: space.id,
        organizationId: space.organizationId,
        clientUserId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: "AWAITING_PAYMENT",
        participantsCount: input.participantsCount,
        purpose: input.purpose,
        priceAmountCents,
        commissionAmountCents,
      },
    });
  } catch (error) {
    if (isBookingSlotConflict(error)) {
      throw new ConflictError("This slot was just booked by someone else");
    }
    throw error;
  }

  let intent: CreatePaymentIntentResult;
  try {
    intent = await provider.createPaymentIntent({
      bookingId: booking.id,
      amountCents: priceAmountCents,
      applicationFeeCents: commissionAmountCents,
      connectedAccountId: organization.stripeAccountId,
      receiptEmail: clientUser.email,
    });
  } catch (error) {
    await compensate(booking.id, error, "booking.payment_intent_failed");
    throw error;
  }

  try {
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        organizationId: space.organizationId,
        provider: provider.name,
        providerPaymentIntentId: intent.providerPaymentIntentId,
        amountCents: priceAmountCents,
        commissionAmountCents,
        netAmountCents: priceAmountCents - commissionAmountCents,
        status: intent.requiresClientConfirmation ? "AWAITING_AUTHORIZATION" : "REQUIRES_CAPTURE",
      },
    });
  } catch (error) {
    await compensate(booking.id, error, "booking.payment_record_failed");
    throw error;
  }

  if (intent.requiresClientConfirmation) {
    // Real Stripe: the browser now confirms the card; the webhook turns the
    // hold into a request and sends the e-mails (applyAuthorization).
    await recordAudit({
      event: "booking.payment_hold_created",
      actorUserId: clientUserId,
      organizationId: space.organizationId,
      metadata: { bookingId: booking.id },
    });
    return { booking, clientSecret: intent.clientSecret };
  }

  // Mock provider: authorized synchronously, so the request is live now.
  booking = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "PENDING" },
  });

  await recordAudit({
    event: "booking.requested",
    actorUserId: clientUserId,
    organizationId: space.organizationId,
    metadata: { bookingId: booking.id },
  });

  const emailContext: BookingEmailContext = {
    clientEmail: clientUser.email,
    clientName: clientUser.name,
    partnerEmail: organization.email,
    partnerOrgName: organization.name,
    spaceName: space.name,
    spaceAddress: space.address,
    spaceCity: space.city,
    spacePostalCode: space.postalCode,
    accessInstructions: space.accessInstructions,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    priceAmountCents,
  };
  await sendBookingRequested(emailContext);
  await sendBookingRequestReceived(emailContext);

  return { booking, clientSecret: intent.clientSecret };
}

/** Deletes an orphaned Booking (created but the payment step failed) so a
 * failed request doesn't leave the slot permanently blocked. */
async function compensate(bookingId: string, cause: unknown, event: string) {
  logError({ event, error: cause, booking_id: bookingId });
  try {
    await prisma.booking.delete({ where: { id: bookingId } });
  } catch (cleanupError) {
    logError({ event: "booking.compensation_failed", error: cleanupError, booking_id: bookingId });
  }
}
