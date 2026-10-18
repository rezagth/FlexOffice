import { z } from "zod";
import { MAX_PROMOTION_DISCOUNT_PERCENT } from "@/server/domains/promotions/pricing";

/** A fixed discount is capped the same way a price itself is (spaces.ts's
 * priceCents) — generous enough for any real rate, never unbounded. */
const MAX_DISCOUNT_AMOUNT_CENTS = 10_000_000;

const commonPromotionFields = {
  spaceIds: z.array(z.uuid()).min(1, "Choisissez au moins un espace.").max(50),
  startsAt: z.coerce.date({ error: "Date de début invalide." }),
  // Optional: no end date means the promotion runs until a human stops it.
  endsAt: z.coerce.date({ error: "Date de fin invalide." }).nullable().optional(),
  usageLimit: z.number().int().min(1, "Le plafond d'utilisation doit être d'au moins 1.").nullable().optional(),
};

const percentagePromotionSchema = z.object({
  discountType: z.literal("PERCENTAGE"),
  discountPercent: z
    .number()
    .int("La remise doit être un pourcentage entier.")
    .min(1, "La remise doit être d'au moins 1 %.")
    .max(MAX_PROMOTION_DISCOUNT_PERCENT, `La remise ne peut pas dépasser ${MAX_PROMOTION_DISCOUNT_PERCENT} %.`),
  ...commonPromotionFields,
});

const fixedAmountPromotionSchema = z.object({
  discountType: z.literal("FIXED_AMOUNT"),
  discountAmountCents: z
    .number()
    .int("Le montant doit être exprimé en centimes entiers.")
    .min(1, "Le montant de la remise doit être positif.")
    .max(MAX_DISCOUNT_AMOUNT_CENTS, "Le montant de la remise est trop élevé."),
  ...commonPromotionFields,
});

/**
 * PRD V1.1, R34-R39 — a promotion form posts its whole state every time
 * (same convention as space-form.tsx), so create and update share one
 * schema. The server never trusts the discounted price itself from this
 * payload — only the discount's definition; the price is always recomputed
 * at booking time (promotions/pricing.ts).
 */
export const promotionSchema = z
  .discriminatedUnion("discountType", [percentagePromotionSchema, fixedAmountPromotionSchema])
  .superRefine((data, ctx) => {
    if (data.endsAt && data.endsAt <= data.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "La date de fin doit être après la date de début." });
    }
  });
export type PromotionInput = z.infer<typeof promotionSchema>;

export const promotionRejectionReasonSchema = z.enum([
  "INCONSISTENT_PRICE",
  "INVALID_DATES",
  "INAPPROPRIATE_CONTENT",
  "MISSING_INFORMATION",
  "OTHER",
]);

/** R48-R52 — a refusal always carries a reason from the fixed list; "autre"
 * always carries its free text. Mirrored by a DB CHECK
 * (promotions_rejection_check) so this cannot be bypassed by a direct write
 * either. */
export const rejectPromotionSchema = z
  .object({
    reason: promotionRejectionReasonSchema,
    note: z.string().trim().max(1000, "Le motif ne peut pas dépasser 1000 caractères.").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.reason === "OTHER" && !data.note?.trim()) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Précisez le motif du refus." });
    }
  });
export type RejectPromotionInput = z.infer<typeof rejectPromotionSchema>;
