import { describe, expect, it } from "vitest";
import { createBookingSchema } from "@/lib/validation/bookings";

const valid = {
  spaceId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  date: "2030-03-04",
  slot: "MORNING",
  participantsCount: 4,
  purpose: "Réunion client",
};

describe("createBookingSchema", () => {
  it("accepts a well-formed booking request", () => {
    expect(createBookingSchema.parse(valid)).toMatchObject({ slot: "MORNING" });
  });

  it("strips any price the caller tries to send — the amount is server-side only", () => {
    const parsed = createBookingSchema.parse({
      ...valid,
      priceAmountCents: 1,
      commissionAmountCents: 0,
    });
    expect(parsed).not.toHaveProperty("priceAmountCents");
    expect(parsed).not.toHaveProperty("commissionAmountCents");
  });

  it("rejects a raw start/end time in place of a named slot", () => {
    expect(() =>
      createBookingSchema.parse({ ...valid, slot: "2030-03-04T09:00:00Z" })
    ).toThrow();
  });

  it("rejects a malformed date", () => {
    expect(() => createBookingSchema.parse({ ...valid, date: "04/03/2030" })).toThrow();
  });

  it("rejects a non-uuid space id", () => {
    expect(() => createBookingSchema.parse({ ...valid, spaceId: "not-a-uuid" })).toThrow();
  });

  it("rejects zero participants", () => {
    expect(() => createBookingSchema.parse({ ...valid, participantsCount: 0 })).toThrow();
  });
});
