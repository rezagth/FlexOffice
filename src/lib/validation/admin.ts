import { z } from "zod";

/** A moderation / suspension decision always carries a reason: it is
 * e-mailed to the person affected and kept in the audit log. */
export const requiredReasonSchema = z.object({
  reason: z
    .string({ error: "Indiquez un motif." })
    .trim()
    .min(3, "Le motif doit faire au moins 3 caractères.")
    .max(1000, "Le motif ne peut pas dépasser 1000 caractères."),
});
export type RequiredReasonInput = z.infer<typeof requiredReasonSchema>;

/** Rejecting a submitted listing: a reason is recommended, not required
 * (the legacy button sent no body at all). */
export const optionalReasonSchema = z.object({
  reason: z.string().trim().max(1000, "Le motif ne peut pas dépasser 1000 caractères.").optional(),
});

export const supportReplySchema = z.object({
  body: z
    .string({ error: "Le message est requis." })
    .trim()
    .min(1, "Le message est requis.")
    .max(5000, "Le message ne peut pas dépasser 5000 caractères."),
  /** Close the ticket once the reply is sent. */
  close: z.boolean().optional(),
});
export type SupportReplyInput = z.infer<typeof supportReplySchema>;

export const adminUserSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
});
