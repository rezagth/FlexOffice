import { z } from "zod";
import { emailSchema, passwordSchema } from "./auth";
import { landlordActivityTypeSchema } from "./landlord";
import { domiciliationKindSchema } from "./domiciliation";

/**
 * PRD V1.1, R15-R21, R44-R46, R61 — the paged signup wizard, replacing the
 * single-page "je cherche / je publie" toggle (register-form.tsx).
 *
 * One schema for the whole wizard rather than one per page: the pages are a
 * UI sequencing concern (lib/signup-wizard-storage.ts owns the
 * resume-within-7-days state), but completeness has to be judged on the
 * full answer set — a SIRET without a legal name is invalid regardless of
 * which page collected which field.
 *
 * NOT collected here: domiciliation (PRD page 4) — out of this lot, see
 * SignupWizard's own doc comment.
 *
 * `sharedFields`/`applySharedRefinements` are also reused, unchanged, by
 * `completeProfileSchema` below (R15/R62 — the same "need/holderType/company
 * information" rules apply whether they're answered at signup or completed
 * later on an existing account; only `name`/`email`/`password`/`acceptTerms`
 * are signup-specific, since an existing account already has those).
 */

const nameSchema = z
  .string({ error: "Nom requis." })
  .trim()
  .min(1, { error: "Nom requis." })
  .max(120, { error: "120 caractères maximum." });

const phoneSchema = z.string().trim().max(30, { error: "30 caractères maximum." });

export const signupNeedSchema = z.enum(["SEARCH", "PUBLISH"], {
  error: "Indiquez si vous cherchez ou si vous publiez un espace.",
});
export type SignupNeed = z.infer<typeof signupNeedSchema>;

export const signupHolderTypeSchema = z.enum(["INDIVIDUAL", "COMPANY"], {
  error: "Indiquez si vous êtes un particulier ou une société.",
});
export type SignupHolderType = z.infer<typeof signupHolderTypeSchema>;

const sharedFields = {
  need: signupNeedSchema,
  holderType: signupHolderTypeSchema,
  // Required only when need === "PUBLISH" — decides which documents the
  // verification dossier requires (requirements.ts); meaningless for a
  // SEARCH-only company (R71-R74: activityType stays null there).
  activityType: landlordActivityTypeSchema.optional(),
  isRealEstateProfessional: z.boolean().optional().default(false),

  phone: phoneSchema.optional(),

  // Required only when holderType === "COMPANY".
  legalName: z.string().trim().min(1).max(200).optional(),
  siret: z
    .string()
    .trim()
    .regex(/^\d{14}$/, { error: "Le SIRET doit contenir 14 chiffres." })
    .optional(),
  siren: z
    .string()
    .trim()
    .regex(/^\d{9}$/, { error: "Le SIREN doit contenir 9 chiffres." })
    .optional(),
  vatNumber: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}[0-9A-Z]{2,13}$/, { error: "Numéro de TVA intracommunautaire invalide." })
    .optional(),
  legalRepresentativeName: z.string().trim().min(1).max(200).optional(),
  address: z.string().trim().min(1).max(255).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, { error: "Le code postal doit contenir 5 chiffres." })
    .optional(),
};

/** `need`/`holderType`/company/address rules, shared by `signupWizardSchema`
 * and `completeProfileSchema`. Does NOT check `acceptTerms` — that only
 * exists on the signup schema, since an existing account already accepted
 * the terms once (B-11). */
function applySharedRefinements(data: z.infer<z.ZodObject<typeof sharedFields>>, ctx: z.RefinementCtx) {
  if (data.need === "PUBLISH" && !data.activityType) {
    ctx.addIssue({
      code: "custom",
      path: ["activityType"],
      message: "Indiquez si vous êtes propriétaire ou exploitant de l'espace.",
    });
  }

  if (data.holderType === "COMPANY") {
    const required: [keyof typeof data, string][] = [
      ["legalName", "Raison sociale requise."],
      ["siret", "SIRET requis."],
      ["legalRepresentativeName", "Nom du représentant légal requis."],
    ];
    for (const [field, message] of required) {
      if (!data[field]) {
        ctx.addIssue({ code: "custom", path: [field], message });
      }
    }
    if (data.siret && data.siren && data.siret.slice(0, 9) !== data.siren) {
      ctx.addIssue({
        code: "custom",
        path: ["siren"],
        message: "Le SIREN ne correspond pas aux 9 premiers chiffres du SIRET.",
      });
    }
  }

  // An organization is created whenever the signup publishes (any holder
  // type) or declares a company (even one that only rents, R71-R74) — in
  // both cases it needs a real address, same as createOrganizationWithVerification()
  // already requires (organizations/create-organization-with-verification.ts).
  if (data.need === "PUBLISH" || data.holderType === "COMPANY") {
    const required: [keyof typeof data, string][] = [
      ["address", "Adresse requise."],
      ["city", "Ville requise."],
      ["postalCode", "Code postal requis."],
    ];
    for (const [field, message] of required) {
      if (!data[field]) {
        ctx.addIssue({ code: "custom", path: [field], message });
      }
    }
  }
}

export const signupWizardSchema = z
  .object({
    ...sharedFields,
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    // Not z.literal(true): that fails to even construct a value for `false`,
    // which aborts the whole parse before superRefine ever runs (confirmed
    // empirically — a Zod 4 quirk, not documented behavior to rely on) and
    // would silently hide every other page's errors behind it. A plain
    // boolean, checked in superRefine like everything else below, keeps the
    // parse structurally valid so every applicable error always surfaces.
    acceptTerms: z.boolean(),
    // 2B, R53-R58 — "page 4", COMPANY only (tenant or partner alike), never
    // collected on /app/complete-profile or /app/become-landlord (explicit
    // scope of this lot): the signup wizard is the one place this is asked.
    // The attestation FILE is not collected here — there is no session yet
    // to attach a private upload to; it is deposited afterwards from Mon
    // compte.
    domiciliationKind: domiciliationKindSchema.optional(),
    domiciliataireName: z.string().trim().min(1).max(200).optional(),
    domiciliationAddress: z.string().trim().min(1).max(255).optional(),
    domiciliationCity: z.string().trim().min(1).max(120).optional(),
    domiciliationPostalCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/, { error: "Le code postal doit contenir 5 chiffres." })
      .optional(),
  })
  .superRefine((data, ctx) => {
    applySharedRefinements(data, ctx);
    if (!data.acceptTerms) {
      ctx.addIssue({
        code: "custom",
        path: ["acceptTerms"],
        message: "Vous devez accepter les CGU et la politique de confidentialité.",
      });
    }
    if (data.holderType === "COMPANY") {
      if (!data.domiciliationKind) {
        ctx.addIssue({
          code: "custom",
          path: ["domiciliationKind"],
          message: "Indiquez comment votre société est domiciliée.",
        });
      }
      if (data.domiciliationKind === "THIRD_PARTY") {
        const required: [keyof typeof data, string][] = [
          ["domiciliataireName", "Nom du domiciliataire requis."],
          ["domiciliationAddress", "Adresse de domiciliation requise."],
          ["domiciliationCity", "Ville requise."],
          ["domiciliationPostalCode", "Code postal requis."],
        ];
        for (const [field, message] of required) {
          if (!data[field]) ctx.addIssue({ code: "custom", path: [field], message });
        }
      }
    }
  });

export type SignupWizardInput = z.infer<typeof signupWizardSchema>;

/**
 * PRD V1.1, R15/R62 — `/app/complete-profile`, for an account whose
 * `need`/`holderType` were never recorded (predates this column). Same rules
 * as the signup wizard minus the signup-only fields (`name`/`email`/
 * `password`/`acceptTerms` all already exist on the account) and minus
 * `phone` (2B): a phone number is no longer collected as plain text
 * anywhere — it only changes through the code-confirmed flow in
 * phone-verification.ts, which this screen embeds as its own component
 * rather than a schema field.
 */
export const completeProfileSchema = z
  .object(sharedFields)
  .omit({ phone: true })
  .superRefine(applySharedRefinements);

export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;
