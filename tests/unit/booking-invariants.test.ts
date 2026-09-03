import { describe, expect, it } from "vitest";
import {
  assertParticipantsFitCapacity,
  assertSlotIsWellFormed,
} from "@/server/domains/bookings/booking-invariants";

/**
 * The booking rules that could not become CHECK constraints.
 *
 * `participants_count <= spaces.capacity` spans two tables, so PostgreSQL
 * cannot express it in a CHECK — migration 20260903110100 records that
 * trade-off and these tests are the other half of it.
 *
 * The gap this closes was live: `createBookingSchema` bounds
 * `participantsCount` to 1..1000 and `createBooking()` compared it to
 * nothing, so a two-seat office could be booked, charged and confirmed for
 * 1000 people.
 *
 * Double-booking is NOT covered here: `create-booking.ts` already translates
 * the `bookings_no_overlap_excl` violation (SQLSTATE 23P01, surfaced by
 * Prisma 7 as P2039 with the detail in the message) into a 409, and
 * tests/integration/booking-exclusion-constraint.test.ts proves the
 * constraint itself under concurrency.
 */
describe("assertParticipantsFitCapacity", () => {
  it("accepts a group that fits", () => {
    expect(() => assertParticipantsFitCapacity(4, 8)).not.toThrow();
  });

  it("accepts a group filling the space exactly", () => {
    expect(() => assertParticipantsFitCapacity(8, 8)).not.toThrow();
  });

  it("rejects a group larger than the capacity", () => {
    expect(() => assertParticipantsFitCapacity(9, 8)).toThrow(/8 personnes/);
  });

  it("rejects the schema's upper bound against a small space", () => {
    // 1000 is what createBookingSchema allows; capacity is what the partner
    // actually advertised.
    expect(() => assertParticipantsFitCapacity(1000, 2)).toThrow();
  });

  it("rejects zero and negative counts", () => {
    expect(() => assertParticipantsFitCapacity(0, 8)).toThrow();
    expect(() => assertParticipantsFitCapacity(-1, 8)).toThrow();
  });

  it("rejects a non-integer count rather than rounding it", () => {
    expect(() => assertParticipantsFitCapacity(2.5, 8)).toThrow();
  });

  it("surfaces a 400, not a 500", () => {
    expect(() => assertParticipantsFitCapacity(99, 8)).toThrow(
      expect.objectContaining({ status: 400, code: "VALIDATION_ERROR" })
    );
  });
});

describe("assertSlotIsWellFormed", () => {
  const start = new Date("2026-09-10T09:00:00Z");

  it("accepts a forward slot", () => {
    expect(() =>
      assertSlotIsWellFormed(start, new Date("2026-09-10T12:00:00Z"))
    ).not.toThrow();
  });

  it("rejects a slot that ends before it starts", () => {
    expect(() =>
      assertSlotIsWellFormed(start, new Date("2026-09-10T08:00:00Z"))
    ).toThrow();
  });

  it("rejects a zero-length slot — it would never overlap anything", () => {
    // An empty range conflicts with nothing, so a degenerate booking would
    // slip straight past the EXCLUDE constraint.
    expect(() => assertSlotIsWellFormed(start, new Date(start))).toThrow();
  });

  it("rejects an invalid date", () => {
    expect(() => assertSlotIsWellFormed(start, new Date("not-a-date"))).toThrow();
  });
});
