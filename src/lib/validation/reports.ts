import { z } from "zod";

export const CONTENT_REPORT_REASON_LABELS = {
  ILLEGAL: "Contenu ou activité illégale",
  NOT_AUTHORIZED: "Le bailleur n'a pas le droit de proposer ce lieu",
  INACCURATE: "Annonce trompeuse ou inexacte",
  DISCRIMINATORY: "Contenu discriminatoire ou haineux",
  OTHER: "Autre motif",
} as const;

export const createReportSchema = z.object({
  reason: z.enum(["ILLEGAL", "NOT_AUTHORIZED", "INACCURATE", "DISCRIMINATORY", "OTHER"], {
    error: "Choisissez un motif.",
  }),
  message: z
    .string({ error: "Expliquez votre signalement." })
    .trim()
    .min(10, "Expliquez en quelques mots (10 caractères minimum).")
    .max(3000, "Le message ne peut pas dépasser 3000 caractères."),
  /** Optional: only used to answer the reporter. */
  email: z.email("Adresse email invalide.").max(255).optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;
