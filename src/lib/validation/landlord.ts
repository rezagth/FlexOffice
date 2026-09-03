import { z } from "zod";

/**
 * "Devenir bailleur" — the information needed to open a letting activity.
 *
 * Discriminated on `holderType`, so the fields a company must supply cannot
 * be omitted by claiming to be an individual and the reverse cannot be
 * smuggled in either. The same shape is enforced by CHECK constraints in
 * migration 20260904100000_account_model_expand: an individual holder must
 * have no SIRET, a company must have one.
 *
 * `activityType` (Phase 3) is collected alongside this, not separately: the
 * organization and its verification dossier are created together in one
 * transaction (see domains/organizations/become-landlord.ts), so the
 * question that determines the dossier's required documents has to be
 * answered before that transaction runs.
 *
 * Still NOT collected here: the documents themselves. Those need a
 * verification id to attach to, which does not exist until this payload has
 * been submitted — see domains/verification/documents.ts.
 */

const address = {
  address: z.string().trim().min(1).max(255),
  city: z.string().trim().min(1).max(120),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Le code postal doit contenir 5 chiffres"),
};

/**
 * Why the organization is entitled to let a space: it owns the property, or
 * it exploits it under a sublet authorisation. Collected as the FIRST
 * question of the "Devenir bailleur" journey — before holder type — because
 * it determines which documents the verification dossier will require (see
 * src/server/domains/verification/requirements.ts). A different axis from
 * `OrgRole.OWNER` (Phase 2's membership inside an organization): this is
 * about the organization's relationship to the space, not a person's
 * standing inside the organization.
 */
export const landlordActivityTypeSchema = z.enum(["OWNER", "OPERATOR"]);

const individualSchema = z.object({
  holderType: z.literal("INDIVIDUAL"),
  activityType: landlordActivityTypeSchema,
  /**
   * How the activity appears to a client — a person letting their own space
   * may want "Bureaux de Jean Dupont" rather than their bare name. Optional:
   * it falls back to the profile's name server-side.
   */
  displayName: z.string().trim().min(1).max(200).optional(),
  /** Defaults to the account's own email server-side. */
  contactEmail: z.email().max(255).optional(),
  ...address,
});

const companySchema = z.object({
  holderType: z.literal("COMPANY"),
  activityType: landlordActivityTypeSchema,
  legalName: z.string().trim().min(1).max(200),
  /** Public-facing name; falls back to the legal name. */
  displayName: z.string().trim().min(1).max(200).optional(),
  siret: z
    .string()
    .trim()
    .regex(/^\d{14}$/, "Le SIRET doit contenir 14 chiffres"),
  /**
   * Derivable from the SIRET (its first 9 digits) but accepted separately so
   * a caller can supply it explicitly; checked for consistency server-side
   * rather than trusted.
   */
  siren: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "Le SIREN doit contenir 9 chiffres")
    .optional(),
  /**
   * Intra-community VAT. Loose on purpose: the exact shape differs per
   * member state, and rejecting a valid foreign number would be worse than
   * accepting a malformed one that Phase 3 will verify properly.
   */
  vatNumber: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}[0-9A-Z]{2,13}$/, "Numéro de TVA intracommunautaire invalide")
    .optional(),
  legalRepresentativeName: z.string().trim().min(1).max(200),
  contactEmail: z.email().max(255).optional(),
  ...address,
});

export const becomeLandlordSchema = z.discriminatedUnion("holderType", [
  individualSchema,
  companySchema,
]);

export type BecomeLandlordInput = z.infer<typeof becomeLandlordSchema>;

/**
 * Mode switch payload.
 *
 * `organizationId` is optional and is only ever a *target*, never a grant:
 * the server checks the caller holds an ACTIVE membership of it before
 * honouring the choice.
 */
export const switchModeSchema = z.object({
  mode: z.enum(["TENANT", "LANDLORD"]),
  organizationId: z.uuid().optional(),
});

export type SwitchModeInput = z.infer<typeof switchModeSchema>;
