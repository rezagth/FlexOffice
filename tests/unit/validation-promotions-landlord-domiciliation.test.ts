import { describe, expect, it } from "vitest";
import { promotionSchema, rejectPromotionSchema } from "@/lib/validation/promotions";
import {
  becomeLandlordSchema,
  organizationIdentityFieldsSchema,
  switchModeSchema,
  updateOrganizationIdentitySchema,
} from "@/lib/validation/landlord";
import {
  domiciliationOfferSettingSchema,
  domiciliationProviderSchema,
  domiciliationRequestSchema,
  domiciliationStatusChangeSchema,
} from "@/lib/validation/domiciliation";

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const ok = (r: { success: boolean }) => r.success;

const basePromo = { spaceIds: [UUID], startsAt: "2026-12-01T00:00:00Z" };

describe("promotionSchema", () => {
  it("pourcentage entier de 1 à 90", () => {
    for (const discountPercent of [1, 50, 90]) {
      expect(ok(promotionSchema.safeParse({ ...basePromo, discountType: "PERCENTAGE", discountPercent }))).toBe(true);
    }
  });
  it.each([0, -5, 91, 100, 12.5, "20", null])("refuse le pourcentage %j", (discountPercent) =>
    expect(ok(promotionSchema.safeParse({ ...basePromo, discountType: "PERCENTAGE", discountPercent }))).toBe(false)
  );
  it("montant fixe entier strictement positif et plafonné", () => {
    expect(ok(promotionSchema.safeParse({ ...basePromo, discountType: "FIXED_AMOUNT", discountAmountCents: 1500 }))).toBe(true);
    for (const discountAmountCents of [0, -1, 10.5, 10_000_001]) {
      expect(ok(promotionSchema.safeParse({ ...basePromo, discountType: "FIXED_AMOUNT", discountAmountCents }))).toBe(false);
    }
  });
  it("un type de remise inconnu est refusé", () => {
    expect(ok(promotionSchema.safeParse({ ...basePromo, discountType: "FREE", discountPercent: 100 }))).toBe(false);
  });
  it("au moins un espace, 50 au plus, tous des UUID", () => {
    const pct = { discountType: "PERCENTAGE", discountPercent: 10 };
    expect(ok(promotionSchema.safeParse({ ...basePromo, ...pct, spaceIds: [] }))).toBe(false);
    expect(ok(promotionSchema.safeParse({ ...basePromo, ...pct, spaceIds: ["x"] }))).toBe(false);
    expect(ok(promotionSchema.safeParse({ ...basePromo, ...pct, spaceIds: Array(51).fill(UUID) }))).toBe(false);
    expect(ok(promotionSchema.safeParse({ ...basePromo, ...pct, spaceIds: Array(50).fill(UUID) }))).toBe(true);
  });
  it("la fin doit être strictement après le début", () => {
    const pct = { ...basePromo, discountType: "PERCENTAGE", discountPercent: 10 };
    expect(ok(promotionSchema.safeParse({ ...pct, endsAt: "2026-12-01T00:00:00Z" }))).toBe(false);
    expect(ok(promotionSchema.safeParse({ ...pct, endsAt: "2026-11-30T00:00:00Z" }))).toBe(false);
    expect(ok(promotionSchema.safeParse({ ...pct, endsAt: "2026-12-01T00:00:01Z" }))).toBe(true);
    expect(ok(promotionSchema.safeParse({ ...pct, endsAt: null }))).toBe(true);
  });
  it("plafond d'utilisation : entier ≥ 1 ou nul", () => {
    const pct = { ...basePromo, discountType: "PERCENTAGE", discountPercent: 10 };
    expect(ok(promotionSchema.safeParse({ ...pct, usageLimit: 1 }))).toBe(true);
    expect(ok(promotionSchema.safeParse({ ...pct, usageLimit: null }))).toBe(true);
    expect(ok(promotionSchema.safeParse({ ...pct, usageLimit: 0 }))).toBe(false);
    expect(ok(promotionSchema.safeParse({ ...pct, usageLimit: 1.5 }))).toBe(false);
  });
  it("une date de début invalide est refusée", () => {
    expect(ok(promotionSchema.safeParse({ ...basePromo, startsAt: "pas une date", discountType: "PERCENTAGE", discountPercent: 10 }))).toBe(false);
  });
  it("ne propage jamais un prix final fourni par le client", () => {
    const parsed = promotionSchema.parse({ ...basePromo, discountType: "PERCENTAGE", discountPercent: 10, finalPriceCents: 1 });
    expect(parsed).not.toHaveProperty("finalPriceCents");
  });
});

describe("rejectPromotionSchema", () => {
  it.each(["INCONSISTENT_PRICE", "INVALID_DATES", "INAPPROPRIATE_CONTENT", "MISSING_INFORMATION"])(
    "%s sans note est accepté",
    (reason) => expect(ok(rejectPromotionSchema.safeParse({ reason }))).toBe(true)
  );
  it("« Autre » exige une note non vide", () => {
    expect(ok(rejectPromotionSchema.safeParse({ reason: "OTHER" }))).toBe(false);
    expect(ok(rejectPromotionSchema.safeParse({ reason: "OTHER", note: "   " }))).toBe(false);
    expect(ok(rejectPromotionSchema.safeParse({ reason: "OTHER", note: "Précision" }))).toBe(true);
  });
  it("motif hors liste refusé, note bornée à 1000", () => {
    expect(ok(rejectPromotionSchema.safeParse({ reason: "BECAUSE" }))).toBe(false);
    expect(ok(rejectPromotionSchema.safeParse({ reason: "OTHER", note: "x".repeat(1001) }))).toBe(false);
  });
});

const address = { address: "1 rue A", city: "Paris", postalCode: "75001" };

describe("becomeLandlordSchema", () => {
  const individual = { holderType: "INDIVIDUAL", activityType: "OWNER", ...address };
  const company = {
    holderType: "COMPANY",
    activityType: "OPERATOR",
    legalName: "Acme SAS",
    siret: "12345678901234",
    legalRepresentativeName: "Jeanne Martin",
    ...address,
  };

  it("particulier et société valides", () => {
    expect(ok(becomeLandlordSchema.safeParse(individual))).toBe(true);
    expect(ok(becomeLandlordSchema.safeParse(company))).toBe(true);
  });
  it("une société sans SIRET, sans raison sociale ou sans représentant est refusée", () => {
    for (const missing of ["siret", "legalName", "legalRepresentativeName"]) {
      const { [missing]: _omit, ...rest } = company as Record<string, unknown>;
      void _omit;
      expect(ok(becomeLandlordSchema.safeParse(rest)), missing).toBe(false);
    }
  });
  it.each(["1234567890123", "123456789012345", "1234567890123a", "123 456 789 01234", ""])("refuse le SIRET %j", (siret) =>
    expect(ok(becomeLandlordSchema.safeParse({ ...company, siret }))).toBe(false)
  );
  it.each(["12345678", "1234567890", "12345678a"])("refuse le SIREN %j", (siren) =>
    expect(ok(becomeLandlordSchema.safeParse({ ...company, siren }))).toBe(false)
  );
  it.each([["FR12345678901", true], ["DE123456789", true], ["fr12345678901", false], ["F", false], ["FR", false], ["FR 123 456", false]])(
    "TVA %j → %s",
    (vatNumber, expected) => expect(ok(becomeLandlordSchema.safeParse({ ...company, vatNumber }))).toBe(expected)
  );
  it("un particulier ne peut pas se faire passer pour une société en omettant le type", () => {
    expect(ok(becomeLandlordSchema.safeParse({ ...company, holderType: undefined }))).toBe(false);
    expect(ok(becomeLandlordSchema.safeParse({ ...company, holderType: "ASSOCIATION" }))).toBe(false);
  });
  it("un particulier n'emporte aucun SIRET dans le résultat", () => {
    const parsed = becomeLandlordSchema.parse({ ...individual, siret: "12345678901234" });
    expect(parsed).not.toHaveProperty("siret");
  });
  it("le type d'activité est obligatoire et limité à OWNER / OPERATOR", () => {
    expect(ok(becomeLandlordSchema.safeParse({ ...individual, activityType: undefined }))).toBe(false);
    expect(ok(becomeLandlordSchema.safeParse({ ...individual, activityType: "AGENT" }))).toBe(false);
  });
  it.each(["7500", "750011", "7500a", "75 001", ""])("refuse le code postal %j", (postalCode) =>
    expect(ok(becomeLandlordSchema.safeParse({ ...individual, postalCode }))).toBe(false)
  );
  it("isRealEstateProfessional vaut false par défaut", () => {
    const parsed = becomeLandlordSchema.parse(company);
    expect((parsed as { isRealEstateProfessional: boolean }).isRealEstateProfessional).toBe(false);
  });
  it("refuse une adresse e-mail de contact invalide", () => {
    expect(ok(becomeLandlordSchema.safeParse({ ...individual, contactEmail: "x" }))).toBe(false);
  });
});

describe("switchModeSchema / identité d'organisation", () => {
  it("mode TENANT ou LANDLORD seulement", () => {
    expect(ok(switchModeSchema.safeParse({ mode: "TENANT" }))).toBe(true);
    expect(ok(switchModeSchema.safeParse({ mode: "LANDLORD", organizationId: UUID }))).toBe(true);
    expect(ok(switchModeSchema.safeParse({ mode: "ADMIN" }))).toBe(false);
    expect(ok(switchModeSchema.safeParse({ mode: "LANDLORD", organizationId: "x" }))).toBe(false);
  });
  it("raison sociale et SIRET toujours requis ensemble", () => {
    expect(ok(organizationIdentityFieldsSchema.safeParse({ legalName: "Acme", siret: "12345678901234" }))).toBe(true);
    expect(ok(organizationIdentityFieldsSchema.safeParse({ legalName: "", siret: "12345678901234" }))).toBe(false);
    expect(ok(organizationIdentityFieldsSchema.safeParse({ legalName: "Acme", siret: "123" }))).toBe(false);
    expect(ok(organizationIdentityFieldsSchema.safeParse({ legalName: "x".repeat(201), siret: "12345678901234" }))).toBe(false);
  });
  it("la mise à jour exige l'identifiant d'organisation", () => {
    expect(ok(updateOrganizationIdentitySchema.safeParse({ legalName: "A", siret: "12345678901234" }))).toBe(false);
    expect(ok(updateOrganizationIdentitySchema.safeParse({ legalName: "A", siret: "12345678901234", organizationId: UUID }))).toBe(true);
  });
});

describe("domiciliation", () => {
  const third = {
    domiciliationKind: "THIRD_PARTY",
    domiciliataireName: "Domi SARL",
    domiciliationAddress: "5 rue B",
    domiciliationCity: "Lyon",
    domiciliationPostalCode: "69001",
  };
  it("MakomSpace : le contrat doit être accepté explicitement (true)", () => {
    expect(ok(domiciliationRequestSchema.safeParse({ domiciliationKind: "MAKOMSPACE" }))).toBe(false);
    expect(ok(domiciliationRequestSchema.safeParse({ domiciliationKind: "MAKOMSPACE", domiciliationContractAccepted: false }))).toBe(false);
    expect(ok(domiciliationRequestSchema.safeParse({ domiciliationKind: "MAKOMSPACE", domiciliationContractAccepted: "true" }))).toBe(false);
    expect(ok(domiciliationRequestSchema.safeParse({ domiciliationKind: "MAKOMSPACE", domiciliationContractAccepted: true }))).toBe(true);
  });
  it("tiers : les quatre champs sont obligatoires", () => {
    expect(ok(domiciliationRequestSchema.safeParse(third))).toBe(true);
    for (const field of ["domiciliataireName", "domiciliationAddress", "domiciliationCity", "domiciliationPostalCode"]) {
      const { [field]: _omit, ...rest } = third as Record<string, unknown>;
      void _omit;
      expect(ok(domiciliationRequestSchema.safeParse(rest)), field).toBe(false);
    }
  });
  it("tiers : n'exige pas l'acceptation du contrat MakomSpace", () => {
    expect(ok(domiciliationRequestSchema.safeParse({ ...third, domiciliationContractAccepted: false }))).toBe(true);
  });
  it.each(["6900", "690011", "69 001", "abcde"])("refuse le code postal %j", (domiciliationPostalCode) =>
    expect(ok(domiciliationRequestSchema.safeParse({ ...third, domiciliationPostalCode }))).toBe(false)
  );
  it("type de domiciliation inconnu refusé", () => {
    expect(ok(domiciliationRequestSchema.safeParse({ domiciliationKind: "AUTRE" }))).toBe(false);
  });
  it("statuts de demande", () => {
    for (const status of ["REQUESTED", "IN_PROGRESS", "ACCEPTED", "REFUSED"]) {
      expect(ok(domiciliationStatusChangeSchema.safeParse({ status }))).toBe(true);
    }
    expect(ok(domiciliationStatusChangeSchema.safeParse({ status: "DONE" }))).toBe(false);
    expect(ok(domiciliationStatusChangeSchema.safeParse({ status: "ACCEPTED", notes: "x".repeat(1001) }))).toBe(false);
  });
  it("l'activation de l'offre est un vrai booléen", () => {
    expect(ok(domiciliationOfferSettingSchema.safeParse({ offerEnabled: true }))).toBe(true);
    expect(ok(domiciliationOfferSettingSchema.safeParse({ offerEnabled: "true" }))).toBe(false);
    expect(ok(domiciliationOfferSettingSchema.safeParse({}))).toBe(false);
  });
  it("domiciliataire agréé : nom et numéro d'agrément obligatoires (2 caractères minimum)", () => {
    expect(ok(domiciliationProviderSchema.safeParse({ name: "Domi", agrementNumber: "AGR-2026-01" }))).toBe(true);
    expect(ok(domiciliationProviderSchema.safeParse({ name: "D", agrementNumber: "AGR" }))).toBe(false);
    expect(ok(domiciliationProviderSchema.safeParse({ name: "Domi", agrementNumber: "" }))).toBe(false);
    expect(ok(domiciliationProviderSchema.safeParse({ name: "Domi" }))).toBe(false);
    expect(domiciliationProviderSchema.parse({ name: "  Domi  ", agrementNumber: " X1 " })).toEqual({ name: "Domi", agrementNumber: "X1" });
  });
});
