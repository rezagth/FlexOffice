import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezone";

export const spaceTypeEnum = z.enum(["MEETING_ROOM", "DESK", "TRAINING_ROOM"]);

export const spaceAmenityEnum = z.enum([
  "WIFI",
  "PARKING",
  "PROJECTOR",
  "SCREEN",
  "PRINTER",
  "KITCHEN",
  "AIR_CONDITIONING",
  "WHEELCHAIR_ACCESS",
  "COFFEE",
  "PHONE_BOOTH",
  "WHITEBOARD",
  "OTHER",
]);

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

/**
 * A weekday may now carry several slots (morning/afternoon) — Phase 5.
 * Only overlap is refused, not repetition: two rows on the same weekday
 * are exactly the point. `zonedTimeToUtc` is not involved here — these are
 * wall-clock "HH:mm" strings compared lexicographically within one
 * weekday, which is chronological order for zero-padded 24h values.
 */
export const openingHoursWeekSchema = z.array(openingHourSchema).max(70).refine(
  (hours) => {
    const byWeekday = new Map<number, typeof hours>();
    for (const h of hours) {
      const list = byWeekday.get(h.weekday) ?? [];
      list.push(h);
      byWeekday.set(h.weekday, list);
    }
    for (const dayHours of byWeekday.values()) {
      const sorted = [...dayHours].sort((a, b) => (a.opensAt < b.opensAt ? -1 : 1));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].opensAt < sorted[i - 1].closesAt) return false;
      }
    }
    return true;
  },
  { message: "Deux créneaux du même jour ne peuvent pas se chevaucher" }
);
export type OpeningHoursWeekInput = z.infer<typeof openingHoursWeekSchema>;

const spaceBaseFields = {
  name: z.string().trim().min(1).max(150),
  type: spaceTypeEnum,
  description: z.string().trim().min(1).max(4000),
  address: z.string().trim().min(1).max(255),
  city: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Le code postal doit contenir 5 chiffres"),
  capacity: z.number().int().min(1).max(1000),
  amenities: z.array(spaceAmenityEnum).max(spaceAmenityEnum.options.length),
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

export const createSpaceSchema = z.object({
  ...spaceBaseFields,
  // The Property this Space is a unit of (Phase 4). Not optional: every new
  // space is created from a property's page, or with one picked explicitly.
  propertyId: z.uuid(),
});
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
