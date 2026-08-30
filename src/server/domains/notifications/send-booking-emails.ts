import { getEmailProvider } from "./get-email-provider";
import { logError } from "@/server/lib/logger";
import {
  bookingConfirmedTemplate,
  bookingRejectedTemplate,
  bookingRequestedTemplate,
  bookingRequestReceivedTemplate,
  type BookingEmailContext,
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
