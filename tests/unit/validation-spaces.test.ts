import { describe, expect, it } from "vitest";
import {
  closureSchema,
  createSpaceSchema,
  openingHoursWeekSchema,
} from "@/lib/validation/spaces";

const validSpace = {
  name: "Salle Rivoli",
  type: "MEETING_ROOM",
  description: "Salle lumineuse",
  address: "12 rue de Rivoli",
  city: "Paris",
  postalCode: "75004",
  capacity: 8,
  amenities: ["Écran", "Wifi"],
  photos: ["https://example.com/photo.jpg"],
  halfDayPriceCents: 9000,
  dayPriceCents: 15000,
};

describe("createSpaceSchema", () => {
  it("accepts a well-formed space", () => {
    expect(createSpaceSchema.parse(validSpace).name).toBe("Salle Rivoli");
  });

  it("rejects a postal code that is not 5 digits", () => {
    expect(() => createSpaceSchema.parse({ ...validSpace, postalCode: "750" })).toThrow();
  });

  it("rejects a photo entry that is not a URL", () => {
    expect(() =>
      createSpaceSchema.parse({ ...validSpace, photos: ["../../etc/passwd"] })
    ).toThrow();
  });

  it("rejects a negative price", () => {
    expect(() => createSpaceSchema.parse({ ...validSpace, dayPriceCents: -1 })).toThrow();
  });
});

describe("openingHoursWeekSchema", () => {
  it("accepts one entry per weekday", () => {
    const parsed = openingHoursWeekSchema.parse([
      { weekday: 1, opensAt: "09:00", closesAt: "18:00" },
      { weekday: 2, opensAt: "09:00", closesAt: "18:00" },
    ]);
    expect(parsed).toHaveLength(2);
  });

  it("rejects a closing time before the opening time", () => {
    expect(() =>
      openingHoursWeekSchema.parse([{ weekday: 1, opensAt: "18:00", closesAt: "09:00" }])
    ).toThrow();
  });

  it("rejects two entries for the same weekday", () => {
    expect(() =>
      openingHoursWeekSchema.parse([
        { weekday: 1, opensAt: "09:00", closesAt: "12:00" },
        { weekday: 1, opensAt: "14:00", closesAt: "18:00" },
      ])
    ).toThrow();
  });

  it("rejects a malformed time", () => {
    expect(() =>
      openingHoursWeekSchema.parse([{ weekday: 1, opensAt: "9h", closesAt: "18:00" }])
    ).toThrow();
  });
});

describe("closureSchema", () => {
  it("rejects an end before the start", () => {
    expect(() =>
      closureSchema.parse({
        startsAt: "2030-01-02T09:00:00Z",
        endsAt: "2030-01-01T09:00:00Z",
        reason: "Travaux",
      })
    ).toThrow();
  });
});
