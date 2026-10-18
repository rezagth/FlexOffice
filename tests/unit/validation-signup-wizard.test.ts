import { describe, expect, it } from "vitest";
import { completeProfileSchema, signupWizardSchema } from "@/lib/validation/signup-wizard";

const VALID_SIGNUP = {
  need: "SEARCH" as const,
  holderType: "INDIVIDUAL" as const,
  isRealEstateProfessional: false,
  name: "Jane Doe",
  email: "jane@example.fr",
  password: "longenoughpw",
  acceptTerms: true,
};

describe("signupWizardSchema", () => {
  it("accepts a minimal individual-tenant signup", () => {
    expect(signupWizardSchema.safeParse(VALID_SIGNUP).success).toBe(true);
  });

  it("requires company fields when holderType is COMPANY", () => {
    const result = signupWizardSchema.safeParse({ ...VALID_SIGNUP, holderType: "COMPANY" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fields = result.error.issues.map((i) => i.path[0]);
    expect(fields).toEqual(
      expect.arrayContaining(["legalName", "siret", "legalRepresentativeName", "address", "city", "postalCode"])
    );
  });

  it("requires activityType when need is PUBLISH", () => {
    const result = signupWizardSchema.safeParse({ ...VALID_SIGNUP, need: "PUBLISH" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path[0] === "activityType")).toBe(true);
  });

  it("requires an address for a PUBLISH individual too", () => {
    const result = signupWizardSchema.safeParse({
      ...VALID_SIGNUP,
      need: "PUBLISH",
      activityType: "OWNER",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path[0] === "address")).toBe(true);
  });

  it("rejects a SIREN that doesn't match the SIRET's first 9 digits", () => {
    const result = signupWizardSchema.safeParse({
      ...VALID_SIGNUP,
      holderType: "COMPANY",
      legalName: "Acme",
      siret: "12345678900011",
      siren: "999999999",
      legalRepresentativeName: "Jane Doe",
      address: "1 rue de Test",
      city: "Paris",
      postalCode: "75001",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path[0] === "siren")).toBe(true);
  });

  it("requires acceptTerms even when every other field is valid (regression: z.literal(true) used to hide every other error)", () => {
    const result = signupWizardSchema.safeParse({ ...VALID_SIGNUP, acceptTerms: false });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0].path).toEqual(["acceptTerms"]);
  });

  it("every applicable error surfaces together, not just the first one found", () => {
    const result = signupWizardSchema.safeParse({
      need: "PUBLISH",
      holderType: "COMPANY",
      isRealEstateProfessional: false,
      name: "",
      email: "jane@example.fr",
      password: "longenoughpw",
      acceptTerms: false,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fields = new Set(result.error.issues.map((i) => i.path[0]));
    for (const expected of [
      "name",
      "activityType",
      "legalName",
      "siret",
      "legalRepresentativeName",
      "address",
      "city",
      "postalCode",
      "acceptTerms",
    ]) {
      expect(fields.has(expected)).toBe(true);
    }
  });
});

describe("completeProfileSchema", () => {
  const VALID = {
    need: "SEARCH" as const,
    holderType: "INDIVIDUAL" as const,
    isRealEstateProfessional: false,
    phone: "0600000000",
  };

  it("accepts a minimal individual completion with a phone", () => {
    expect(completeProfileSchema.safeParse(VALID).success).toBe(true);
  });

  it("requires a phone, unlike the signup schema where it's optional", () => {
    const result = completeProfileSchema.safeParse({ ...VALID, phone: undefined });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path[0] === "phone")).toBe(true);
  });

  it("ignores fields it doesn't declare (name/email/password) — an existing account already has those", () => {
    const result = completeProfileSchema.safeParse({ ...VALID, name: "", email: "not-an-email" });
    expect(result.success).toBe(true);
  });

  it("still requires company fields for holderType COMPANY, same rule as signup", () => {
    const result = completeProfileSchema.safeParse({ ...VALID, holderType: "COMPANY" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fields = result.error.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["legalName", "siret", "legalRepresentativeName"]));
  });
});
