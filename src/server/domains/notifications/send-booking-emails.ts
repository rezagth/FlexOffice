import { sendSafely } from "./send-safely";
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
 * Every send is best-effort (see send-safely.ts): a failed email must never
 * fail the booking transition it announces.
 */

export async function sendBookingRequested(ctx: BookingEmailContext): Promise<void> {
  await sendSafely(() => bookingRequestedTemplate(ctx), "email.booking_requested.failed");
}

export async function sendBookingRequestReceived(ctx: BookingEmailContext): Promise<void> {
  await sendSafely(() => bookingRequestReceivedTemplate(ctx), "email.booking_request_received.failed");
}

export async function sendBookingConfirmed(ctx: BookingEmailContext): Promise<void> {
  await sendSafely(() => bookingConfirmedTemplate(ctx), "email.booking_confirmed.failed");
}

export async function sendBookingRejected(ctx: BookingEmailContext): Promise<void> {
  await sendSafely(() => bookingRejectedTemplate(ctx), "email.booking_rejected.failed");
}

export async function sendBookingExpired(ctx: BookingEmailContext): Promise<void> {
  await sendSafely(() => bookingExpiredTemplate(ctx), "email.booking_expired.failed");
}

export async function sendBookingCancelledByClient(ctx: CancellationEmailContext) {
  await sendSafely(() => bookingCancelledByClientTemplate(ctx), "email.booking_cancelled_by_client.failed");
  await sendSafely(() => bookingCancelledByClientNoticeTemplate(ctx), "email.booking_cancelled_by_client_notice.failed");
}

export async function sendBookingCancelledByLandlord(ctx: CancellationEmailContext) {
  await sendSafely(() => bookingCancelledByLandlordTemplate(ctx), "email.booking_cancelled_by_landlord.failed");
  await sendSafely(() => bookingCancelledByLandlordNoticeTemplate(ctx), "email.booking_cancelled_by_landlord_notice.failed");
}
