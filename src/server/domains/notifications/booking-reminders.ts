import { prisma } from "@/server/db/prisma";
import { logEvent } from "@/server/lib/logger";
import { sendSafely } from "./send-safely";
import { bookingReminderTemplate } from "./templates";

/** A confirmed booking starting within this window gets its reminder. The
 * maintenance job runs every 15 minutes, so in practice the e-mail leaves
 * about 24 h before the start. */
export const REMINDER_WINDOW_HOURS = 24;

/** At most this many reminders per run, so one run stays short. */
const REMINDER_BATCH_SIZE = 200;

/**
 * Sends the day-before reminder of each CONFIRMED booking starting within
 * the next 24 h. Idempotent: each booking is claimed with a conditional
 * update on `reminder_sent_at IS NULL` BEFORE the e-mail leaves, so two
 * overlapping runs (or a retried one) never send it twice. The trade-off is
 * at-most-once: if the provider fails after the claim, that reminder is not
 * retried — a missed reminder is better than a duplicate, and the
 * confirmation e-mail already carried the same details.
 */
export async function sendDueBookingReminders(now: Date = new Date()) {
  const horizon = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);
  const due = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      startsAt: { gt: now, lte: horizon },
    },
    include: { clientUser: true, organization: true, space: true },
    orderBy: { startsAt: "asc" },
    take: REMINDER_BATCH_SIZE,
  });

  let sent = 0;
  for (const booking of due) {
    const claimed = await prisma.booking.updateMany({
      where: { id: booking.id, status: "CONFIRMED", reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claimed.count === 0) continue;
    // An anonymized (GDPR-deleted) client has no real address any more.
    if (booking.clientUser.deletedAt) continue;

    const ok = await sendSafely(
      () =>
        bookingReminderTemplate({
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
        }),
      "email.booking_reminder.failed"
    );
    if (ok) sent += 1;
  }

  if (due.length > 0) logEvent({ event: "booking.reminder_run", candidates: due.length, sent });
  return { candidates: due.length, sent };
}
