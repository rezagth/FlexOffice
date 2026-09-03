import { z } from "zod";

export const propertyTypeEnum = z.enum([
  "OFFICE",
  "COMMERCIAL",
  "COWORKING",
  "MEETING_SPACE",
  "RESIDENTIAL",
  "MIXED_USE",
  "OTHER",
]);

const propertyBaseFields = {
  label: z.string().trim().min(1).max(150),
  propertyType: propertyTypeEnum,
  description: z.string().trim().max(4000).optional(),
  addressLine1: z.string().trim().min(1).max(255),
  addressLine2: z.string().trim().max(255).optional(),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Le code postal doit contenir 5 chiffres"),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120).optional(),
  country: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, "Code pays ISO à 2 lettres (ex. FR)")
    .optional(),
  // Not required at creation: the geocoding provider is a later phase, so a
  // property can exist and be let before its coordinates are known.
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
};

export const createPropertySchema = z.object(propertyBaseFields);
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = z.object(propertyBaseFields).partial();
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

export const ownershipShareBasisPoints = z.number().int().min(1).max(10000);

export const addPropertyOwnerSchema = z
  .object({
    profileId: z.uuid().optional(),
    organizationId: z.uuid().optional(),
    ownershipShareBasisPoints,
  })
  .refine((v) => Boolean(v.profileId) !== Boolean(v.organizationId), {
    message: "Indiquer soit un profil, soit une organisation, jamais les deux",
  });
export type AddPropertyOwnerInput = z.infer<typeof addPropertyOwnerSchema>;

export const addPropertyOperatorSchema = z
  .object({
    profileId: z.uuid().optional(),
    organizationId: z.uuid().optional(),
    mandateReference: z.string().trim().max(255).optional(),
  })
  .refine((v) => Boolean(v.profileId) !== Boolean(v.organizationId), {
    message: "Indiquer soit un profil, soit une organisation, jamais les deux",
  });
export type AddPropertyOperatorInput = z.infer<typeof addPropertyOperatorSchema>;

export const addPropertyManagerSchema = z
  .object({
    profileId: z.uuid().optional(),
    organizationId: z.uuid().optional(),
    scope: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => Boolean(v.profileId) !== Boolean(v.organizationId), {
    message: "Indiquer soit un profil, soit une organisation, jamais les deux",
  });
export type AddPropertyManagerInput = z.infer<typeof addPropertyManagerSchema>;

/** The full new photo order, as ids — see `reorderPropertyPhotos()`/
 * `reorderSpacePhotos()`: a replace, not a partial move. */
export const reorderPhotosSchema = z.object({
  photoIds: z.array(z.uuid()).min(1).max(20),
});
export type ReorderPhotosInput = z.infer<typeof reorderPhotosSchema>;
