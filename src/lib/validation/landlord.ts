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
 * Deliberately NOT collected here: identity documents, proof of ownership,
 * Kbis, sublet authorisation. Those are Phase 3, and asking for them now
 * would mean storing files with no verification workflow to consume them.
 */

const address = {
  address: z.string().trim().min(1).max(255),
  city: z.string().trim().min(1).max(120),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Le code postal doit contenir 5 chiffres"),
};

const individualSchema = z.object({
  holderType: z.literal("INDIVIDUAL"),
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
