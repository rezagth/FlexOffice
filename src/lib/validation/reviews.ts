import { z } from "zod";

export const REVIEW_TEXT_MAX = 2000;

/** Optional free text: trimmed, and an empty string is no comment at all. */
const optionalText = z
  .string()
  .trim()
  .max(REVIEW_TEXT_MAX, `${REVIEW_TEXT_MAX} caractères maximum.`)
  .optional()
  .transform((value) => (value ? value : null));

export const createReviewSchema = z.object({
  rating: z
    .number({ error: "Choisissez une note de 1 à 5." })
    .int()
    .min(1, "Choisissez une note de 1 à 5.")
    .max(5, "Choisissez une note de 1 à 5."),
  comment: optionalText,
});

export const reviewReplySchema = z.object({
  reply: z
    .string()
    .trim()
    .min(1, "Écrivez votre réponse.")
    .max(REVIEW_TEXT_MAX, `${REVIEW_TEXT_MAX} caractères maximum.`),
});

export const hideReviewSchema = z.object({
  reason: z.string().trim().min(3, "Indiquez le motif.").max(500),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
