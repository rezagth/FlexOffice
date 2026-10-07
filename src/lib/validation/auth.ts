import { z } from "zod";

/**
 * One password rule for every place a password is chosen — signup, reset
 * and change — so the three can never drift apart. 72 is bcrypt's input
 * limit (GoTrue hashes with bcrypt; bytes past 72 are silently ignored).
 */
export const PASSWORD_MIN_LENGTH = 8;
export const passwordSchema = z
  .string({ error: "Mot de passe requis." })
  .min(PASSWORD_MIN_LENGTH, { error: `${PASSWORD_MIN_LENGTH} caractères minimum.` })
  .max(72, { error: "72 caractères maximum." });

export const emailSchema = z
  .email({ error: "Adresse e-mail invalide." })
  .max(255, { error: "Adresse e-mail trop longue." });

const nameSchema = z
  .string({ error: "Nom requis." })
  .trim()
  .min(1, { error: "Nom requis." })
  .max(120, { error: "120 caractères maximum." });

const phoneSchema = z.string().trim().max(30, { error: "30 caractères maximum." });

const baseFields = {
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  phone: phoneSchema.optional(),
  // B-11: the box must be ticked. A literal, so `false` or a missing field
  // never reaches the register domain — which records the acceptance itself,
  // server-side, rather than trusting anything else the client sent.
  acceptTerms: z.literal(true, {
    error: "Vous devez accepter les CGU et la politique de confidentialité.",
  }),
};

const clientRegisterSchema = z.object({
  role: z.literal("CLIENT"),
  ...baseFields,
});

const partnerRegisterSchema = z.object({
  role: z.literal("PARTNER"),
  ...baseFields,
  organizationName: z
    .string()
    .trim()
    .min(1, { error: "Raison sociale requise." })
    .max(200, { error: "200 caractères maximum." }),
  organizationSiret: z
    .string()
    .trim()
    .regex(/^\d{14}$/, { error: "Le SIRET doit contenir 14 chiffres." }),
  organizationEmail: emailSchema.optional(),
  organizationAddress: z
    .string()
    .trim()
    .min(1, { error: "Adresse requise." })
    .max(255, { error: "255 caractères maximum." }),
  organizationCity: z
    .string()
    .trim()
    .min(1, { error: "Ville requise." })
    .max(120, { error: "120 caractères maximum." }),
  organizationPostalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, { error: "Le code postal doit contenir 5 chiffres." }),
});

export const registerSchema = z.discriminatedUnion("role", [
  clientRegisterSchema,
  partnerRegisterSchema,
]);

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: "Mot de passe requis." })
    .min(1, { error: "Mot de passe requis." })
    .max(72, { error: "72 caractères maximum." }),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** POST /api/auth/password/forgot */
export const forgotPasswordSchema = z.object({ email: emailSchema });

/**
 * POST /api/auth/password/update — the new password, plus the current one
 * when the session is not a fresh recovery session (account page). The
 * route decides which applies; see users/password.ts.
 */
export const updatePasswordSchema = z.object({
  password: passwordSchema,
  currentPassword: z.string().min(1).max(72).optional(),
});

/** PATCH /api/account/profile — only the fields a user may edit themselves. */
export const updateProfileSchema = z.object({
  name: nameSchema,
  // "" clears the number; stored as NULL rather than an empty string.
  phone: phoneSchema
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** POST /api/account/email */
export const changeEmailSchema = z.object({ email: emailSchema });

/** POST /api/client/gdpr/delete — re-authentication before erasure. */
export const deleteAccountSchema = z.object({
  password: z
    .string({ error: "Mot de passe requis." })
    .min(1, { error: "Mot de passe requis." })
    .max(72, { error: "72 caractères maximum." }),
});

/**
 * Field → first error message, for forms that show errors under each field
 * (UX-12). Works on any Zod error; keys are the top-level field names.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
