import { describe, expect, it } from "vitest";
import {
  hasAllRequiredDocuments,
  missingDocumentTypes,
  requiredDocumentTypes,
  VERIFICATION_DOCUMENT_TYPE_LABELS,
} from "@/server/domains/verification/requirements";
import { CAPABILITIES } from "@/server/auth/capabilities";

/**
 * The document matrix, matching the brief's four scenarios exactly. This is
 * the ONE place the mapping is decided — both the onboarding UI and
 * `submitVerification()`'s completeness check read it, so the two can never
 * silently disagree about what a complete dossier looks like.
 */
describe("requiredDocumentTypes", () => {
  it("individual + owner: CNI + acte de propriété", () => {
    expect(requiredDocumentTypes("INDIVIDUAL", "OWNER")).toEqual([
      "IDENTITY_DOCUMENT",
      "OWNERSHIP_PROOF",
    ]);
  });

  it("individual + operator: CNI + autorisation de sous-location", () => {
    expect(requiredDocumentTypes("INDIVIDUAL", "OPERATOR")).toEqual([
      "IDENTITY_DOCUMENT",
      "SUBLEASE_AUTHORIZATION",
    ]);
  });

  it("company + owner: Kbis + TVA + CNI du représentant légal", () => {
    expect(requiredDocumentTypes("COMPANY", "OWNER")).toEqual([
      "K_BIS",
      "VAT_PROOF",
      "LEGAL_REPRESENTATIVE_ID",
    ]);
  });

  it("company + operator: Kbis + TVA + CNI représentant légal + sous-location", () => {
    expect(requiredDocumentTypes("COMPANY", "OPERATOR")).toEqual([
      "K_BIS",
      "VAT_PROOF",
      "LEGAL_REPRESENTATIVE_ID",
      "SUBLEASE_AUTHORIZATION",
    ]);
  });

  it("company + isRealEstateProfessional: adds PROFESSIONAL_CARD on top of the usual company documents", () => {
    expect(requiredDocumentTypes("COMPANY", "OWNER", true)).toEqual([
      "K_BIS",
      "VAT_PROOF",
      "LEGAL_REPRESENTATIVE_ID",
      "PROFESSIONAL_CARD",
    ]);
    expect(requiredDocumentTypes("COMPANY", "OPERATOR", true)).toEqual([
      "K_BIS",
      "VAT_PROOF",
      "LEGAL_REPRESENTATIVE_ID",
      "SUBLEASE_AUTHORIZATION",
      "PROFESSIONAL_CARD",
    ]);
  });

  it("isRealEstateProfessional is ignored for an individual — no French professional card for a person here", () => {
    expect(requiredDocumentTypes("INDIVIDUAL", "OWNER", true)).toEqual([
      "IDENTITY_DOCUMENT",
      "OWNERSHIP_PROOF",
    ]);
  });

  it("defaults to false when isRealEstateProfessional is omitted", () => {
    expect(requiredDocumentTypes("COMPANY", "OWNER")).not.toContain("PROFESSIONAL_CARD");
  });

  it("never requires OWNERSHIP_PROOF for an operator", () => {
    // An exploitant does not own the space, so proof of ownership would be
    // the wrong document to ask for.
    for (const holderType of ["INDIVIDUAL", "COMPANY"] as const) {
      expect(requiredDocumentTypes(holderType, "OPERATOR")).not.toContain("OWNERSHIP_PROOF");
    }
  });

  it("never requires SUBLEASE_AUTHORIZATION for an owner", () => {
    for (const holderType of ["INDIVIDUAL", "COMPANY"] as const) {
      expect(requiredDocumentTypes(holderType, "OWNER")).not.toContain(
        "SUBLEASE_AUTHORIZATION"
      );
    }
  });

  it("every required type is a real VerificationDocumentType", () => {
    for (const holderType of ["INDIVIDUAL", "COMPANY"] as const) {
      for (const activityType of ["OWNER", "OPERATOR"] as const) {
        for (const type of requiredDocumentTypes(holderType, activityType)) {
          expect(VERIFICATION_DOCUMENT_TYPE_LABELS).toHaveProperty(type);
        }
      }
    }
  });
});

describe("hasAllRequiredDocuments", () => {
  it("is false with no documents at all", () => {
    expect(hasAllRequiredDocuments("INDIVIDUAL", "OWNER", [])).toBe(false);
  });

  it("is false when one required type is missing", () => {
    expect(hasAllRequiredDocuments("INDIVIDUAL", "OWNER", ["IDENTITY_DOCUMENT"])).toBe(false);
  });

  it("is true once every required type has at least one upload", () => {
    expect(
      hasAllRequiredDocuments("INDIVIDUAL", "OWNER", ["IDENTITY_DOCUMENT", "OWNERSHIP_PROOF"])
    ).toBe(true);
  });

  it("does not care about extra, non-required uploads", () => {
    expect(
      hasAllRequiredDocuments("INDIVIDUAL", "OWNER", [
        "IDENTITY_DOCUMENT",
        "OWNERSHIP_PROOF",
        "OTHER",
      ])
    ).toBe(true);
  });

  it("tolerates duplicate uploads of the same required type", () => {
    expect(
      hasAllRequiredDocuments("INDIVIDUAL", "OWNER", [
        "IDENTITY_DOCUMENT",
        "IDENTITY_DOCUMENT",
        "OWNERSHIP_PROOF",
      ])
    ).toBe(true);
  });

  it("requires all four for a company operator", () => {
    const threeOfFour = ["K_BIS", "VAT_PROOF", "LEGAL_REPRESENTATIVE_ID"] as const;
    expect(hasAllRequiredDocuments("COMPANY", "OPERATOR", threeOfFour)).toBe(false);
    expect(
      hasAllRequiredDocuments("COMPANY", "OPERATOR", [...threeOfFour, "SUBLEASE_AUTHORIZATION"])
    ).toBe(true);
  });
});

describe("missingDocumentTypes", () => {
  it("lists nothing once complete", () => {
    expect(
      missingDocumentTypes("INDIVIDUAL", "OWNER", ["IDENTITY_DOCUMENT", "OWNERSHIP_PROOF"])
    ).toEqual([]);
  });

  it("lists exactly what is missing, preserving the required order", () => {
    expect(missingDocumentTypes("COMPANY", "OWNER", ["K_BIS"])).toEqual([
      "VAT_PROOF",
      "LEGAL_REPRESENTATIVE_ID",
    ]);
  });
});

describe("VERIFICATION_DOCUMENT_TYPE_LABELS", () => {
  it("has a French label for every document type used anywhere in the matrix", () => {
    for (const holderType of ["INDIVIDUAL", "COMPANY"] as const) {
      for (const activityType of ["OWNER", "OPERATOR"] as const) {
        for (const type of requiredDocumentTypes(holderType, activityType)) {
          expect(typeof VERIFICATION_DOCUMENT_TYPE_LABELS[type]).toBe("string");
          expect(VERIFICATION_DOCUMENT_TYPE_LABELS[type].length).toBeGreaterThan(0);
        }
      }
    }
  });
});

/** Sanity check that Phase 3's capability was actually declared, not just
 * used — a typo'd capability string would compile (it is a plain string
 * literal type) but never be granted to anyone. */
describe("landlord:manage_verification capability", () => {
  it("is declared in the capability catalogue", () => {
    expect(CAPABILITIES).toContain("landlord:manage_verification");
  });
});
