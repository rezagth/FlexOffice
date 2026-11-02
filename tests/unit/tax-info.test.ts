import { describe, expect, it } from "vitest";
import { isTaxInfoComplete, missingTaxInfo, quarterOf, type TaxInfoSource } from "@/server/domains/organizations/tax-info";
import { taxInfoSchema } from "@/lib/validation/tax-info";

const company: TaxInfoSource = {
  holderType: "COMPANY",
  siren: "123456789",
  siret: "12345678900011",
  taxResidenceCountry: "FR",
  taxIdentificationNumber: null,
  representativeBirthDate: null,
};

describe("missingTaxInfo (DAC7)", () => {
  it("a French company is complete with its SIREN and country, no tax number needed", () => {
    expect(isTaxInfoComplete(company)).toBe(true);
  });

  it("requires the country of tax residence", () => {
    expect(missingTaxInfo({ ...company, taxResidenceCountry: null })).toContain("le pays de résidence fiscale");
  });

  it("a foreign company needs a tax identification number even with a SIRET", () => {
    expect(missingTaxInfo({ ...company, taxResidenceCountry: "BE" })).toEqual(["le numéro d'identification fiscale"]);
    expect(isTaxInfoComplete({ ...company, taxResidenceCountry: "BE", taxIdentificationNumber: "BE0123456789" })).toBe(true);
  });

  it("an individual needs the tax number and the birth date", () => {
    const individual: TaxInfoSource = { ...company, holderType: "INDIVIDUAL", siren: null, siret: null };
    expect(missingTaxInfo(individual)).toEqual(["le numéro d'identification fiscale", "la date de naissance"]);
    expect(
      isTaxInfoComplete({ ...individual, taxIdentificationNumber: "1234567890123", representativeBirthDate: new Date("1985-04-12") })
    ).toBe(true);
  });

  it("ignores blank strings and the case of the country code", () => {
    expect(missingTaxInfo({ ...company, taxResidenceCountry: "  " })).toContain("le pays de résidence fiscale");
    expect(isTaxInfoComplete({ ...company, taxResidenceCountry: "fr" })).toBe(true);
  });
});

describe("taxInfoSchema", () => {
  it("uppercases a 2-letter country and rejects anything else", () => {
    expect(taxInfoSchema.parse({ taxResidenceCountry: "fr" }).taxResidenceCountry).toBe("FR");
    expect(taxInfoSchema.safeParse({ taxResidenceCountry: "France" }).success).toBe(false);
  });

  it("validates the birth date format", () => {
    expect(taxInfoSchema.safeParse({ taxResidenceCountry: "FR", representativeBirthDate: "12/04/1985" }).success).toBe(false);
    expect(taxInfoSchema.safeParse({ taxResidenceCountry: "FR", representativeBirthDate: "1985-04-12" }).success).toBe(true);
  });
});

describe("quarterOf", () => {
  it("maps months to calendar quarters", () => {
    expect(quarterOf(new Date("2026-01-15T00:00:00Z"))).toBe(1);
    expect(quarterOf(new Date("2026-03-31T23:00:00Z"))).toBe(1);
    expect(quarterOf(new Date("2026-04-01T00:00:00Z"))).toBe(2);
    expect(quarterOf(new Date("2026-12-31T00:00:00Z"))).toBe(4);
  });
});
