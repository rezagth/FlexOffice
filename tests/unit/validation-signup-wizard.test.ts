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

  describe("domiciliation (2B, R53-R58)", () => {
    const VALID_COMPANY = {
      ...VALID_SIGNUP,
      holderType: "COMPANY" as const,
      legalName: "Acme",
      siret: "12345678900011",
      legalRepresentativeName: "Jane Doe",
      address: "1 rue de Test",
      city: "Paris",
      postalCode: "75001",
    };

    it("requires a domiciliationKind for a COMPANY signup, never for INDIVIDUAL", () => {
      expect(signupWizardSchema.safeParse(VALID_SIGNUP).success).toBe(true); // INDIVIDUAL, no domiciliation needed
      const result = signupWizardSchema.safeParse(VALID_COMPANY);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues.some((i) => i.path[0] === "domiciliationKind")).toBe(true);
    });

    it("accepts MAKOMSPACE with no further fields", () => {
      expect(
        signupWizardSchema.safeParse({ ...VALID_COMPANY, domiciliationKind: "MAKOMSPACE" }).success
      ).toBe(true);
    });

    it("requires the domiciliataire's details for THIRD_PARTY", () => {
      const result = signupWizardSchema.safeParse({ ...VALID_COMPANY, domiciliationKind: "THIRD_PARTY" });
      expect(result.success).toBe(false);
      if (result.success) return;
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toEqual(
        expect.arrayContaining([
          "domiciliataireName",
          "domiciliationAddress",
          "domiciliationCity",
          "domiciliationPostalCode",
        ])
      );
    });

    it("accepts THIRD_PARTY once its fields are filled", () => {
      expect(
        signupWizardSchema.safeParse({
          ...VALID_COMPANY,
          domiciliationKind: "THIRD_PARTY",
          domiciliataireName: "Domiciliation SARL",
          domiciliationAddress: "2 rue de Test",
          domiciliationCity: "Lyon",
          domiciliationPostalCode: "69001",
        }).success
      ).toBe(true);
    });
  });
});

describe("completeProfileSchema", () => {
  const VALID = {
    need: "SEARCH" as const,
    holderType: "INDIVIDUAL" as const,
    isRealEstateProfessional: false,
  };

  it("accepts a minimal individual completion", () => {
    expect(completeProfileSchema.safeParse(VALID).success).toBe(true);
  });

  it("has no phone field (2B) — that's the separate code-confirmed flow in phone-verification.ts", () => {
    const result = completeProfileSchema.safeParse({ ...VALID, phone: "not validated here" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty("phone");
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
