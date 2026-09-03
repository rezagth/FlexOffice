import type {
  HolderType,
  LandlordActivityType,
  VerificationDocumentType,
} from "@/generated/prisma/client";

/**
 * Which documents a dossier needs, by (holderType, activityType).
 *
 * This is the ONE place that decision is made. The onboarding UI reads it to
 * show the right upload slots, and `submitVerification()` reads the same
 * function to decide whether a dossier is complete — so the two can never
 * silently disagree about what "complete" means.
 *
 * Kept as code, not a database table or constraint: the mapping is exactly
 * four rows and change to it is a product decision, not data — see the
 * `VerificationDocumentType` enum's own comment on why the document type
 * list itself stays open-ended (OTHER) while this mapping stays precise.
 *
 * THE FOUR SCENARIOS, MATCHING THE BRIEF EXACTLY
 *   individual + owner     CNI + acte de propriété
 *   individual + operator  CNI + autorisation de sous-location
 *   company + owner        Kbis + TVA + CNI du représentant légal
 *   company + operator     Kbis + TVA + CNI du représentant légal
 *                             + autorisation de sous-location
 *
 * A FIFTH AXIS — REAL ESTATE PROFESSIONALS
 * `isRealEstateProfessional` adds the French "carte professionnelle" (carte
 * T) on top of whatever the company scenario already required. Only
 * meaningful for a COMPANY (an individual cannot hold that card) — a `true`
 * value on an INDIVIDUAL dossier is simply ignored here rather than
 * rejected, since the become-landlord form already only offers the checkbox
 * on the company step.
 */
export function requiredDocumentTypes(
  holderType: HolderType,
  activityType: LandlordActivityType,
  isRealEstateProfessional = false
): readonly VerificationDocumentType[] {
  if (holderType === "INDIVIDUAL") {
    return activityType === "OWNER"
      ? (["IDENTITY_DOCUMENT", "OWNERSHIP_PROOF"] as const)
      : (["IDENTITY_DOCUMENT", "SUBLEASE_AUTHORIZATION"] as const);
  }

  // COMPANY
  const base =
    activityType === "OWNER"
      ? (["K_BIS", "VAT_PROOF", "LEGAL_REPRESENTATIVE_ID"] as const)
      : ([
          "K_BIS",
          "VAT_PROOF",
          "LEGAL_REPRESENTATIVE_ID",
          "SUBLEASE_AUTHORIZATION",
        ] as const);

  return isRealEstateProfessional ? ([...base, "PROFESSIONAL_CARD"] as const) : base;
}

/**
 * True once at least one document of every required type has been uploaded.
 *
 * Presence only — not review status. Whether an uploaded document is
 * actually convincing is what the admin review step is for; a caller who has
 * supplied *something* for each required slot may submit, and a reviewer who
 * finds a document unconvincing rejects the whole dossier with a reason
 * rather than the system silently deciding a document was insufficient.
 */
export function hasAllRequiredDocuments(
  holderType: HolderType,
  activityType: LandlordActivityType,
  uploadedTypes: readonly VerificationDocumentType[],
  isRealEstateProfessional = false
): boolean {
  const required = requiredDocumentTypes(holderType, activityType, isRealEstateProfessional);
  const uploaded = new Set(uploadedTypes);
  return required.every((type) => uploaded.has(type));
}

/** The required types not yet covered by an upload. For error messages and UI. */
export function missingDocumentTypes(
  holderType: HolderType,
  activityType: LandlordActivityType,
  uploadedTypes: readonly VerificationDocumentType[],
  isRealEstateProfessional = false
): VerificationDocumentType[] {
  const required = requiredDocumentTypes(holderType, activityType, isRealEstateProfessional);
  const uploaded = new Set(uploadedTypes);
  return required.filter((type) => !uploaded.has(type));
}

/** French labels for the document types, used by both the onboarding UI and
 * the admin review screen so the two never describe a document differently. */
export const VERIFICATION_DOCUMENT_TYPE_LABELS: Record<VerificationDocumentType, string> = {
  IDENTITY_DOCUMENT: "Pièce d'identité",
  OWNERSHIP_PROOF: "Acte de propriété",
  K_BIS: "Extrait Kbis",
  VAT_PROOF: "Justificatif de TVA intracommunautaire",
  LEGAL_REPRESENTATIVE_ID: "Pièce d'identité du représentant légal",
  SUBLEASE_AUTHORIZATION: "Autorisation de sous-location",
  PROFESSIONAL_CARD: "Carte professionnelle (carte T)",
  OTHER: "Autre document",
};
