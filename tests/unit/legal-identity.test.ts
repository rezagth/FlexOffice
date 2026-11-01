import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGAL_FIELDS, legalFieldValue, missingLegalFields } from "@/lib/legal-identity";

afterEach(() => vi.unstubAllEnvs());

describe("legal identity", () => {
  it("reports every variable as missing when none is set, by name only", () => {
    for (const name of Object.values(LEGAL_FIELDS)) vi.stubEnv(name, "");
    expect(missingLegalFields()).toEqual(Object.values(LEGAL_FIELDS));
    expect(legalFieldValue("legalName")).toBeUndefined();
  });

  it("treats a blank value as absent and trims a real one", () => {
    vi.stubEnv("PLATFORM_LEGAL_NAME", "   ");
    expect(legalFieldValue("legalName")).toBeUndefined();
    vi.stubEnv("PLATFORM_LEGAL_NAME", "  Orbitech SAS ");
    expect(legalFieldValue("legalName")).toBe("Orbitech SAS");
  });

  it("drops a variable from the missing list once it is filled", () => {
    for (const name of Object.values(LEGAL_FIELDS)) vi.stubEnv(name, "x");
    expect(missingLegalFields()).toEqual([]);
    vi.stubEnv("PLATFORM_DPO", "");
    expect(missingLegalFields()).toEqual(["PLATFORM_DPO"]);
  });

  it("shares its company fields with the invoices' platform identity", () => {
    expect(LEGAL_FIELDS.legalName).toBe("PLATFORM_LEGAL_NAME");
    expect(LEGAL_FIELDS.vatNumber).toBe("PLATFORM_VAT_NUMBER");
    expect(LEGAL_FIELDS.rcs).toBe("PLATFORM_RCS");
  });
});
