import { z } from "zod";

export const taxInfoSchema = z.object({
  /** ISO 3166-1 alpha-2, e.g. "FR". */
  taxResidenceCountry: z
    .string({ error: "Indiquez le pays de résidence fiscale." })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Indiquez le code du pays sur 2 lettres (ex. FR)."),
  taxIdentificationNumber: z
    .string()
    .trim()
    .min(3, "Numéro d'identification fiscale trop court.")
    .max(40, "Numéro d'identification fiscale trop long.")
    .optional(),
  /** YYYY-MM-DD. Asked of individuals only. */
  representativeBirthDate: z.iso.date("Date de naissance invalide (AAAA-MM-JJ).").optional(),
});
export type TaxInfoInput = z.infer<typeof taxInfoSchema>;
