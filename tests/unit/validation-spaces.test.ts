import { describe, expect, it } from "vitest";
import {
  capacityBoundsForType,
  capacityViolation,
  closureSchema,
  createSpaceSchema,
  discountedPriceCents,
  openingHoursWeekSchema,
  pricingViolation,
  updateSpaceSchema,
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

describe("type/capacity consistency (PRD V1.1, R3-R4)", () => {
  it("requires a capacity for every type, including café/poste", () => {
    const result = createSpaceSchema.safeParse({ ...validSpace, capacity: undefined });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["capacity"]);

    const cafeResult = createSpaceSchema.safeParse({
      ...validSpace,
      type: "CAFE_SPOT",
      capacity: undefined,
    });
    expect(cafeResult.success).toBe(false);
    expect(cafeResult.error?.issues[0]?.path).toEqual(["capacity"]);
  });

  it("accepts a café/poste declared for 1 or 2 people", () => {
    expect(createSpaceSchema.safeParse({ ...validSpace, type: "CAFE_SPOT", capacity: 1 }).success).toBe(true);
    expect(createSpaceSchema.safeParse({ ...validSpace, type: "CAFE_SPOT", capacity: 2 }).success).toBe(true);
  });

  it("rejects a café/poste declared for 3 or more people", () => {
    const result = createSpaceSchema.safeParse({ ...validSpace, type: "CAFE_SPOT", capacity: 3 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["capacity"]);
  });

  it("does not narrow the generic range for other types", () => {
    expect(capacityBoundsForType("CAFE_SPOT")).toEqual({ min: 1, max: 2 });
    expect(capacityBoundsForType("DESK")).toEqual({ min: 1, max: 1000 });
    expect(capacityBoundsForType("MEETING_ROOM")).toEqual({ min: 1, max: 1000 });
    expect(capacityBoundsForType("TRAINING_ROOM")).toEqual({ min: 1, max: 1000 });
  });

  it("capacityViolation mirrors pricingViolation's shape — null when fine, a message otherwise", () => {
    expect(capacityViolation("CAFE_SPOT", 2)).toBeNull();
    expect(capacityViolation("CAFE_SPOT", 3)).toMatch(/entre 1 et 2/);
    expect(capacityViolation("DESK", 500)).toBeNull();
  });

  it("an update only re-checks capacity when the payload sends both type and capacity", () => {
    // A partial payload with just one of the two cannot be judged without
    // knowing the space's other current value — the service layer does that
    // (organizations/update-space.ts), not the schema.
    expect(updateSpaceSchema.safeParse({ capacity: 4 }).success).toBe(true);
    expect(updateSpaceSchema.safeParse({ type: "CAFE_SPOT" }).success).toBe(true);
    expect(updateSpaceSchema.safeParse({ type: "CAFE_SPOT", capacity: 4 }).success).toBe(false);
    expect(updateSpaceSchema.safeParse({ type: "CAFE_SPOT", capacity: 2 }).success).toBe(true);
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
    expect(result.error?.issues[0]?.message).toBe("Le prix après remise doit être d'au moins 1,00 €.");
  });

  it("refuses a discount above 90 %", () => {
    const result = createSpaceSchema.safeParse({ ...validSpace, discountPercent: 91 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/90 %/);
  });

  it("accepts 90 % when the discounted price stays at 1,00 € or more", () => {
    expect(createSpaceSchema.safeParse({ ...validSpace, halfDayPriceCents: 1000, discountPercent: 90 }).success).toBe(true);
  });

  it("refuses a discount that brings a slot under 1,00 €", () => {
    const result = createSpaceSchema.safeParse({ ...validSpace, halfDayPriceCents: 500, discountPercent: 90 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["halfDayPriceCents"]);
  });

  it("checks a partial update carrying the three pricing fields", () => {
    expect(
      updateSpaceSchema.safeParse({ halfDayPriceCents: 150, dayPriceCents: 150, discountPercent: 50 }).success
    ).toBe(false);
    // A partial payload without both prices is checked in the service layer.
    expect(updateSpaceSchema.safeParse({ discountPercent: 50 }).success).toBe(true);
  });

  it("pricingViolation and discountedPriceCents round down like the booking computation", () => {
    expect(discountedPriceCents(999, 33)).toBe(669);
    expect(pricingViolation({ halfDayPriceCents: 112, dayPriceCents: 1000, discountPercent: 10 })).toBeNull();
    expect(pricingViolation({ halfDayPriceCents: 111, dayPriceCents: 1000, discountPercent: 10 })?.field).toBe(
      "halfDayPriceCents"
    );
  });
});
