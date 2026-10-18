import { describe, expect, it } from "vitest";
import {
  closureSchema,
  createSpaceSchema,
  openingHoursWeekSchema,
  spaceTypeEnum,
} from "@/lib/validation/spaces";

const validSpace = {
  name: "Salle Rivoli",
  type: "MEETING_ROOM",
  description: "Salle lumineuse",
  address: "12 rue de Rivoli",
  city: "Paris",
  postalCode: "75004",
  capacity: 8,
  amenities: ["SCREEN", "WIFI"],
  photos: ["https://example.com/photo.jpg"],
  halfDayPriceCents: 9000,
  dayPriceCents: 15000,
  propertyId: "b6f2f5f0-3e0a-4c3f-8b0a-9a3f6a2e6b7d",
};

/** PRD V1.1, R3 — "café / poste" was only a landing-page comparison example
 * (R1/R2), never a space type; it must never resurface as one. */
describe("spaceTypeEnum", () => {
  it("has exactly the 3 real space types — no café/poste", () => {
    expect([...spaceTypeEnum.options].sort()).toEqual(["DESK", "MEETING_ROOM", "TRAINING_ROOM"]);
  });

  it("rejects café/poste as a type", () => {
    expect(createSpaceSchema.safeParse({ ...validSpace, type: "CAFE_SPOT" }).success).toBe(false);
  });
});

describe("createSpaceSchema", () => {
  it("accepts a well-formed space", () => {
    expect(createSpaceSchema.parse(validSpace).name).toBe("Salle Rivoli");
  });

  it("rejects a postal code that is not 5 digits", () => {
    expect(() => createSpaceSchema.parse({ ...validSpace, postalCode: "750" })).toThrow();
  });

  it("never accepts photos from the payload — they only come from the upload routes (SEC-09)", () => {
    const parsed = createSpaceSchema.parse({ ...validSpace, photos: ["https://tracker.example/pixel.gif"] });
    expect(parsed).not.toHaveProperty("photos");
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

  it("accepts two non-overlapping slots on the same weekday (Phase 5)", () => {
    const parsed = openingHoursWeekSchema.parse([
      { weekday: 1, opensAt: "09:00", closesAt: "12:00" },
      { weekday: 1, opensAt: "14:00", closesAt: "18:00" },
    ]);
    expect(parsed).toHaveLength(2);
  });

  it("rejects two overlapping slots on the same weekday", () => {
    expect(() =>
      openingHoursWeekSchema.parse([
        { weekday: 1, opensAt: "09:00", closesAt: "14:00" },
        { weekday: 1, opensAt: "12:00", closesAt: "18:00" },
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

describe("pricing rules (FCT-22 / SEC-18)", () => {
  it("refuses a price under 1,00 €", () => {
    const result = createSpaceSchema.safeParse({ ...validSpace, halfDayPriceCents: 99 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Le prix doit être d'au moins 1,00 €.");
  });

  it("accepts a price at exactly the 1,00 € floor", () => {
    expect(createSpaceSchema.safeParse({ ...validSpace, halfDayPriceCents: 100 }).success).toBe(true);
  });
});
