import { describe, expect, it } from "vitest";
import {
  changeEmailSchema,
  deleteAccountSchema,
  fieldErrors,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  updatePasswordSchema,
  updateProfileSchema,
} from "@/lib/validation/auth";

const validClient = {
  role: "CLIENT" as const,
  email: "client@example.com",
  password: "supersecret",
  name: "Sam Client",
  acceptTerms: true as const,
};

const validPartner = {
  role: "PARTNER" as const,
  email: "partner@example.com",
  password: "supersecret",
  name: "Julie Martin",
  acceptTerms: true as const,
  organizationName: "Atelier Partners",
  organizationSiret: "12345678900014",
  organizationAddress: "12 rue de Rivoli",
  organizationCity: "Paris",
  organizationPostalCode: "75004",
};

describe("registerSchema", () => {
  it("accepts a valid CLIENT payload", () => {
    expect(registerSchema.safeParse(validClient).success).toBe(true);
  });

  it("accepts a valid PARTNER payload", () => {
    expect(registerSchema.safeParse(validPartner).success).toBe(true);
  });

  it("rejects a PARTNER payload missing organization fields", () => {
    const { organizationName, ...rest } = validPartner;
    void organizationName;
    expect(registerSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a malformed SIRET", () => {
    const result = registerSchema.safeParse({
      ...validPartner,
      organizationSiret: "not-a-siret",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    const result = registerSchema.safeParse({ ...validClient, password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({ ...validClient, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown role", () => {
    const result = registerSchema.safeParse({ ...validClient, role: "ADMIN" });
    expect(result.success).toBe(false);
  });
});

describe("registerSchema — terms acceptance (B-11)", () => {
  it("rejects a signup without the CGU/privacy box ticked", () => {
    const { acceptTerms, ...rest } = validClient;
    void acceptTerms;
    const result = registerSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).acceptTerms).toMatch(/CGU/);
    }
  });

  it("rejects acceptTerms: false and a truthy non-boolean", () => {
    expect(registerSchema.safeParse({ ...validClient, acceptTerms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validClient, acceptTerms: "true" }).success).toBe(false);
  });

  it("gives French per-field messages (UX-12)", () => {
    const result = registerSchema.safeParse({ ...validClient, email: "x", password: "short", name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors.email).toBe("Adresse e-mail invalide.");
      expect(errors.password).toBe("8 caractères minimum.");
      expect(errors.name).toBe("Nom requis.");
    }
  });
});

describe("account schemas", () => {
  it("forgotPasswordSchema only needs a valid address", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.fr" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });

  it("updatePasswordSchema applies the signup password rule", () => {
    expect(updatePasswordSchema.safeParse({ password: "short" }).success).toBe(false);
    expect(updatePasswordSchema.safeParse({ password: "a".repeat(73) }).success).toBe(false);
    expect(updatePasswordSchema.safeParse({ password: "longenough" }).success).toBe(true);
    expect(
      updatePasswordSchema.safeParse({ password: "longenough", currentPassword: "old" }).success
    ).toBe(true);
  });

  it("updateProfileSchema normalises an empty phone to null and ignores unknown fields", () => {
    const parsed = updateProfileSchema.parse({ name: " Sam ", phone: "", id: "someone-else", email: "x@y.z" });
    expect(parsed).toEqual({ name: "Sam", phone: null });
    expect(updateProfileSchema.parse({ name: "Sam" }).phone).toBeNull();
    expect(updateProfileSchema.safeParse({ name: "" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: "Sam", phone: "1".repeat(31) }).success).toBe(false);
  });

  it("changeEmailSchema and deleteAccountSchema validate their single field", () => {
    expect(changeEmailSchema.safeParse({ email: "new@example.com" }).success).toBe(true);
    expect(changeEmailSchema.safeParse({ email: "" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: "" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({}).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: "x" }).success).toBe(true);
  });

  it("loginSchema reports a missing password per field", () => {
    const result = loginSchema.safeParse({ email: "a@b.fr", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)).toEqual({ password: "Mot de passe requis." });
  });
});
