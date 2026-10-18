import { z } from "zod";

/**
 * PRD V1.1, 2B, R53-R58, S11 — domiciliation, COMPANY-holder organizations
 * only. Two choices, not a free text field: "chez MakomSpace" (a reviewed
 * subscription request, S11: gated server-side by
 * DomiciliationSettings.offerEnabled, never trusted from the client alone)
 * or "déjà domicilié ailleurs" (self-declared, with an attestation).
 */
export const domiciliationKindSchema = z.enum(["MAKOMSPACE", "THIRD_PARTY"], {
  error: "Indiquez comment votre société est domiciliée.",
});
export type DomiciliationKind = z.infer<typeof domiciliationKindSchema>;

// Field names prefixed `domiciliation*` throughout — the signup wizard
// already has `address`/`city`/`postalCode` for the COMPANY'S OWN operating
// address (lib/validation/signup-wizard.ts); these describe a DIFFERENT
// address (the third-party domiciliataire's), and sharing the bare names
// would collide when both sets of fields live on the same wizard schema.
const domiciliataireFields = {
  domiciliataireName: z.string().trim().min(1).max(200).optional(),
  domiciliationAddress: z.string().trim().min(1).max(255).optional(),
  domiciliationCity: z.string().trim().min(1).max(120).optional(),
  domiciliationPostalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, { error: "Le code postal doit contenir 5 chiffres." })
    .optional(),
};

/** Shared by the signup wizard's "page 4" and the standalone creation from
 * "Mon compte" — same two choices, same required fields for THIRD_PARTY. */
export const domiciliationRequestSchema = z
  .object({
    domiciliationKind: domiciliationKindSchema,
    ...domiciliataireFields,
  })
  .superRefine((data, ctx) => {
    if (data.domiciliationKind !== "THIRD_PARTY") return;
    const required: [keyof typeof data, string][] = [
      ["domiciliataireName", "Nom du domiciliataire requis."],
      ["domiciliationAddress", "Adresse de domiciliation requise."],
      ["domiciliationCity", "Ville requise."],
      ["domiciliationPostalCode", "Code postal requis."],
    ];
    for (const [field, message] of required) {
      if (!data[field]) ctx.addIssue({ code: "custom", path: [field], message });
    }
  });
export type DomiciliationRequestInput = z.infer<typeof domiciliationRequestSchema>;

export const domiciliationStatusSchema = z.enum(["REQUESTED", "IN_PROGRESS", "ACCEPTED", "REFUSED"]);

export const domiciliationStatusChangeSchema = z.object({
  status: domiciliationStatusSchema,
  notes: z.string().trim().max(1000).optional(),
});
export type DomiciliationStatusChangeInput = z.infer<typeof domiciliationStatusChangeSchema>;

export const domiciliationOfferSettingSchema = z.object({
  offerEnabled: z.boolean(),
});
