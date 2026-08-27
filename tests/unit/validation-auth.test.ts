import { describe, expect, it } from "vitest";
import { registerSchema } from "@/lib/validation/auth";

const validClient = {
  role: "CLIENT" as const,
  email: "client@example.com",
  password: "supersecret",
  name: "Sam Client",
};

const validPartner = {
  role: "PARTNER" as const,
  email: "partner@example.com",
  password: "supersecret",
  name: "Julie Martin",
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
