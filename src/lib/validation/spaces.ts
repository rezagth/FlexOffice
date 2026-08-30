import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezone";

export const spaceTypeEnum = z.enum(["MEETING_ROOM", "DESK", "TRAINING_ROOM"]);

const timeString = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format attendu : HH:mm");

export const openingHourSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    opensAt: timeString,
    closesAt: timeString,
  })
  .refine((h) => h.opensAt < h.closesAt, {
    message: "L'heure de fermeture doit être après l'heure d'ouverture",
    path: ["closesAt"],
  });

export const openingHoursWeekSchema = z
  .array(openingHourSchema)
  .max(7)
  .refine((hours) => new Set(hours.map((h) => h.weekday)).size === hours.length, {
    message: "Un seul horaire par jour de semaine",
  });
export type OpeningHoursWeekInput = z.infer<typeof openingHoursWeekSchema>;

const spaceBaseFields = {
  name: z.string().trim().min(1).max(150),
  type: spaceTypeEnum,
  description: z.string().trim().min(1).max(4000),
  address: z.string().trim().min(1).max(255),
  city: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Le code postal doit contenir 5 chiffres"),
  capacity: z.number().int().min(1).max(1000),
  amenities: z.array(z.string().trim().min(1).max(60)).max(30),
  // Photos are not set through this schema any more: they are uploaded one
  // by one to Storage (see api/partner/spaces/[id]/photos). Kept optional so
  // an existing payload carrying URLs is still accepted.
  photos: z.array(z.url()).max(10).optional(),
  halfDayPriceCents: z.number().int().min(0),
  dayPriceCents: z.number().int().min(0),
  accessInstructions: z.string().trim().max(2000).optional(),
  // The zone the opening hours are written in. Validated against the
  // runtime's own IANA database rather than a hand-kept list, so a typo is
  // rejected instead of silently resolving to UTC.
  timezone: z
    .string()
    .trim()
    .refine(isValidTimeZone, "Fuseau horaire inconnu")
    .optional(),
};

export const createSpaceSchema = z.object(spaceBaseFields);
export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;

export const updateSpaceSchema = z.object(spaceBaseFields).partial();
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;

export const closureSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.string().trim().min(1).max(255),
  })
  .refine((c) => c.startsAt < c.endsAt, {
    message: "La date de fin doit être après la date de début",
    path: ["endsAt"],
  });
export type ClosureInput = z.infer<typeof closureSchema>;
