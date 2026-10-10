import { describe, expect, it } from "vitest";
import { isOrganizationVerified } from "@/lib/verification";

describe("isOrganizationVerified — public 'Entreprise vérifiée' badge", () => {
  it("shows the badge only for an organization that actually completed verification", () => {
    expect(isOrganizationVerified("VERIFIED")).toBe(true);
  });

  it("never shows the badge for an organization still pending verification", () => {
    expect(isOrganizationVerified("PENDING_VERIFICATION")).toBe(false);
  });

  it("never shows the badge for a suspended organization", () => {
    expect(isOrganizationVerified("SUSPENDED")).toBe(false);
  });

  it("never shows the badge when the status is missing or unrecognized", () => {
    expect(isOrganizationVerified(undefined)).toBe(false);
    expect(isOrganizationVerified(null)).toBe(false);
    expect(isOrganizationVerified("something-unexpected")).toBe(false);
  });
});
