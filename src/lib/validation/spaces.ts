import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezone";
import { isCancellationWindowHours } from "@/lib/cancellation-policy";

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

/** Lowest price a client may be charged for a slot: 1,00 €. Below that, the
 * card fees exceed the amount and the commission rounds to nothing. Also the
 * floor a Promotion discount can never push a price under — see
 * domains/promotions/pricing.ts's MIN_PROMOTION_FINAL_PRICE_CENTS. */
export const MIN_SLOT_PRICE_CENTS = 100;

const priceCents = z
  .number({ error: "Le prix doit être un nombre." })
  .int("Le prix doit être exprimé en centimes entiers.")
  .min(MIN_SLOT_PRICE_CENTS, "Le prix doit être d'au moins 1,00 €.")
  .max(10_000_000, "Le prix est trop élevé.");

// Photos are deliberately NOT part of these schemas: a listing's images only
// come from the upload routes (sniffed type, server-generated storage path).
// An arbitrary URL was a tracking pixel or unmoderated content waiting to be
// shown on a public page. A `photos` key in a payload is stripped by Zod.
const spaceBaseFields = {
  name: z.string().trim().min(1).max(150),
  type: spaceTypeEnum,
  description: z.string().trim().min(1).max(4000),
  address: z.string().trim().min(1).max(255),
  city: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Le code postal doit contenir 5 chiffres"),
  capacity: z.number().int().min(1).max(1000),
  amenities: z.array(spaceAmenityEnum).max(spaceAmenityEnum.options.length),
  halfDayPriceCents: priceCents,
  dayPriceCents: priceCents,
  accessInstructions: z.string().trim().max(2000).optional(),
  // Hours before the start inside which a client cancelling gets half of the
  // price back: 0 (none), 48, 168 or 720. See lib/cancellation-policy.ts.
  cancellationWindowHours: z
    .number()
    .int()
    .refine(isCancellationWindowHours, "Délai d'annulation inconnu.")
    .optional(),
  // The zone the opening hours are written in. Validated against the
  // runtime's own IANA database rather than a hand-kept list, so a typo is
  // rejected instead of silently resolving to UTC.
  timezone: z
    .string()
    .trim()
    .refine(isValidTimeZone, "Fuseau horaire inconnu")
    .optional(),
};

/** A new space's fields, without the property it belongs to — for routes
 * that take the property from the URL. */
export const createSpaceFieldsSchema = z.object(spaceBaseFields);

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
