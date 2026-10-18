import { z } from "zod";
import { requiredReasonSchema } from "./admin";

/**
 * 2B — a phone number about to receive (or stand in for, in the
 * NUMBER_CHANGE flow) a verification code. Normalizes common human input
 * (spaces, dots, dashes, parentheses) before checking shape, so "06 12 34
 * 56 78" and "0612345678" are treated identically. Loose on the exact
 * international format until a real `SmsProvider` exists to enforce its own
 * rules (E.164 or otherwise) — this only rejects obvious garbage.
 */
export const smsPhoneSchema = z
  .string({ error: "Numéro de téléphone requis." })
  .trim()
  .transform((value) => value.replace(/[\s.\-()]/g, ""))
  .refine((value) => /^\+?[0-9]{6,15}$/.test(value), {
    error: "Numéro de téléphone invalide.",
  });

export const requestPhoneCodeSchema = z.object({
  newPhone: smsPhoneSchema,
});
export type RequestPhoneCodeInput = z.infer<typeof requestPhoneCodeSchema>;

export const confirmPhoneCodeSchema = z.object({
  code: z
    .string({ error: "Code requis." })
    .trim()
    .regex(/^\d{6}$/, { error: "Le code doit contenir 6 chiffres." }),
});
export type ConfirmPhoneCodeInput = z.infer<typeof confirmPhoneCodeSchema>;

/** Support-assisted path (no self-service when the old number is
 * unreachable) — a reason is mandatory, same as suspending an account. */
export const adminSetVerifiedPhoneSchema = z.object({
  newPhone: smsPhoneSchema,
  reason: requiredReasonSchema.shape.reason,
});
export type AdminSetVerifiedPhoneInput = z.infer<typeof adminSetVerifiedPhoneSchema>;
