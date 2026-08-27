import { z } from "zod";

const baseFields = {
  email: z.email().max(255),
  password: z.string().min(8).max(72),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).optional(),
};

const clientRegisterSchema = z.object({
  role: z.literal("CLIENT"),
  ...baseFields,
});

const partnerRegisterSchema = z.object({
  role: z.literal("PARTNER"),
  ...baseFields,
  organizationName: z.string().trim().min(1).max(200),
  organizationSiret: z
    .string()
    .trim()
    .regex(/^\d{14}$/, "Le SIRET doit contenir 14 chiffres"),
  organizationEmail: z.email().max(255).optional(),
  organizationAddress: z.string().trim().min(1).max(255),
  organizationCity: z.string().trim().min(1).max(120),
  organizationPostalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Le code postal doit contenir 5 chiffres"),
});

export const registerSchema = z.discriminatedUnion("role", [
  clientRegisterSchema,
  partnerRegisterSchema,
]);

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().max(255),
  password: z.string().min(1).max(72),
});

export type LoginInput = z.infer<typeof loginSchema>;
