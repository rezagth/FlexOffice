import { describe, expect, it } from "vitest";
import {
  addPropertyOwnerSchema,
  createPropertySchema,
  updatePropertySchema,
} from "@/lib/validation/properties";

const validProperty = {
  label: "Immeuble Paris 8",
  propertyType: "OFFICE",
  addressLine1: "12 rue de Rivoli",
  city: "Paris",
  postalCode: "75004",
};

describe("createPropertySchema", () => {
  it("accepts a well-formed property", () => {
    expect(createPropertySchema.parse(validProperty).label).toBe("Immeuble Paris 8");
  });

  it("defaults country to nothing (createProperty() defaults it to FR)", () => {
    const parsed = createPropertySchema.parse(validProperty);
    expect(parsed.country).toBeUndefined();
  });

  it("rejects an unknown property type", () => {
    expect(() => createPropertySchema.parse({ ...validProperty, propertyType: "CASTLE" })).toThrow();
  });

  it("rejects a malformed postal code", () => {
    expect(() => createPropertySchema.parse({ ...validProperty, postalCode: "ABC" })).toThrow();
  });

  it("rejects out-of-range coordinates", () => {
    expect(() => createPropertySchema.parse({ ...validProperty, latitude: 200 })).toThrow();
  });

  it("accepts missing coordinates — geocoding is not required at creation", () => {
    expect(createPropertySchema.parse(validProperty).latitude).toBeUndefined();
  });
});

describe("updatePropertySchema", () => {
  it("accepts a partial payload", () => {
    expect(updatePropertySchema.parse({ label: "Nouveau nom" })).toEqual({ label: "Nouveau nom" });
  });
});

describe("addPropertyOwnerSchema", () => {
  it("accepts a profile holder", () => {
    expect(
      addPropertyOwnerSchema.parse({
        profileId: "b6f2f5f0-3e0a-4c3f-8b0a-9a3f6a2e6b7d",
        ownershipShareBasisPoints: 5000,
      }).ownershipShareBasisPoints
    ).toBe(5000);
  });

  it("rejects both a profile and an organization at once", () => {
    expect(() =>
      addPropertyOwnerSchema.parse({
        profileId: "b6f2f5f0-3e0a-4c3f-8b0a-9a3f6a2e6b7d",
        organizationId: "b6f2f5f0-3e0a-4c3f-8b0a-9a3f6a2e6b7d",
        ownershipShareBasisPoints: 5000,
      })
    ).toThrow();
  });

  it("rejects neither a profile nor an organization", () => {
    expect(() => addPropertyOwnerSchema.parse({ ownershipShareBasisPoints: 5000 })).toThrow();
  });

  it("rejects a share above 10000 basis points", () => {
    expect(() =>
      addPropertyOwnerSchema.parse({
        organizationId: "b6f2f5f0-3e0a-4c3f-8b0a-9a3f6a2e6b7d",
        ownershipShareBasisPoints: 10001,
      })
    ).toThrow();
  });
});
