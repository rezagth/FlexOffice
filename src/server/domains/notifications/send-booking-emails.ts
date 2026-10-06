import { getEmailProvider } from "./get-email-provider";
import { logError } from "@/server/lib/logger";
import {
  bookingCancelledByClientNoticeTemplate,
  bookingCancelledByClientTemplate,
  bookingCancelledByLandlordNoticeTemplate,
  bookingCancelledByLandlordTemplate,
  bookingConfirmedTemplate,
  bookingExpiredTemplate,
  bookingRejectedTemplate,
  bookingRequestedTemplate,
  bookingRequestReceivedTemplate,
  type BookingEmailContext,
  type CancellationEmailContext,
} from "./templates";

/**
 * Every send is best-effort: a failed email must never fail the booking
 * transition it announces. Callers await these for ordering/logging only,
 * never to gate a state change.
 */
async function sendSafely(build: () => { to: string; subject: string; text: string }, event: string) {
  try {
    const message = build();
    await getEmailProvider().send(message);
  } catch (error) {
    logError({ event, error });
  }
}

export function sendBookingRequested(ctx: BookingEmailContext) {
  return sendSafely(() => bookingRequestedTemplate(ctx), "email.booking_requested.failed");
}

export function sendBookingRequestReceived(ctx: BookingEmailContext) {
  return sendSafely(() => bookingRequestReceivedTemplate(ctx), "email.booking_request_received.failed");
}

export function sendBookingConfirmed(ctx: BookingEmailContext) {
  return sendSafely(() => bookingConfirmedTemplate(ctx), "email.booking_confirmed.failed");
}

export function sendBookingRejected(ctx: BookingEmailContext) {
  return sendSafely(() => bookingRejectedTemplate(ctx), "email.booking_rejected.failed");
}

export function sendBookingExpired(ctx: BookingEmailContext) {
  return sendSafely(() => bookingExpiredTemplate(ctx), "email.booking_expired.failed");
}

export async function sendBookingCancelledByClient(ctx: CancellationEmailContext) {
  await sendSafely(() => bookingCancelledByClientTemplate(ctx), "email.booking_cancelled_by_client.failed");
  await sendSafely(() => bookingCancelledByClientNoticeTemplate(ctx), "email.booking_cancelled_by_client_notice.failed");
}

export async function sendBookingCancelledByLandlord(ctx: CancellationEmailContext) {
  await sendSafely(() => bookingCancelledByLandlordTemplate(ctx), "email.booking_cancelled_by_landlord.failed");
  await sendSafely(() => bookingCancelledByLandlordNoticeTemplate(ctx), "email.booking_cancelled_by_landlord_notice.failed");
}
