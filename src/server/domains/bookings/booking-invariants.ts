import { ValidationError } from "@/server/lib/errors";

/**
 * Booking rules that no database constraint can hold.
 *
 * A PostgreSQL CHECK may only reference columns of the row being written, so
 * `participants_count <= spaces.capacity` is not expressible: it spans two
 * tables. The alternative would be a trigger, which puts a SELECT on the
 * write path of every booking and is exactly as easy to forget as a service
 * call while being much harder to read. The trade-off is recorded in
 * migration 20260903110100_business_integrity_constraints and covered by
 * tests/integration/business-constraints.test.ts.
 *
 * Everything that CAN be a constraint already is one, and stays the
 * authority: `ends_at > starts_at`, `participants_count > 0`, non-negative
 * amounts, commission within price, and `bookings_no_overlap_excl` for
 * double-booking (translated to a 409 in create-booking.ts).
 */

/**
 * The gap this closes: `createBookingSchema` bounds `participantsCount` to
 * 1..1000 and `createBooking()` never compares it to anything, so a two-seat
 * office could be booked — and charged, and confirmed — for 1000 people. The
 * capacity is advertised on the public listing, so the partner would only
 * find out on the day.
 *
 * Must be called with the capacity read from the database, never one supplied
 * by the client.
 */
export function assertParticipantsFitCapacity(
  participantsCount: number,
  spaceCapacity: number
) {
  if (!Number.isInteger(participantsCount) || participantsCount < 1) {
    throw new ValidationError("Le nombre de participants doit être au moins 1.");
  }
  if (participantsCount > spaceCapacity) {
    throw new ValidationError(
      `Cet espace accueille ${spaceCapacity} personnes au maximum.`
    );
  }
}

/**
 * Mirrors `bookings_ends_after_starts_check` so a caller gets a readable
 * message instead of a raw constraint violation. The constraint remains what
 * guarantees it.
 *
 * A zero-length slot is rejected for a specific reason: an empty range never
 * overlaps anything, so a degenerate booking would slip straight past
 * `bookings_no_overlap_excl`.
 */
export function assertSlotIsWellFormed(startsAt: Date, endsAt: Date) {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new ValidationError("Créneau invalide.");
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new ValidationError("La fin du créneau doit suivre son début.");
  }
}
