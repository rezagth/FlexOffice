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

/** Lowest price a client may be charged for a slot, after discount: 1,00 €.
 * Below that, the card fees exceed the amount and the commission rounds to
 * nothing. */
export const MIN_SLOT_PRICE_CENTS = 100;
/** Highest discount a landlord may set. */
export const MAX_DISCOUNT_PERCENT = 90;

/** The price actually charged for a slot — same rounding as
 * `applyDiscount()` in domains/bookings/availability.ts (down to the cent). */
export function discountedPriceCents(priceCents: number, discountPercent: number | null | undefined): number {
  if (!discountPercent) return priceCents;
  return Math.floor((priceCents * (100 - discountPercent)) / 100);
}

export const MIN_PRICE_MESSAGE = "Le prix après remise doit être d'au moins 1,00 €.";

/**
 * Pricing invariant shared by the Zod schemas and the service layer (a
 * partial update must be checked against the stored values it does not
 * resend). Returns the French message of the first broken rule, or null.
 */
export function pricingViolation(pricing: {
  halfDayPriceCents: number;
  dayPriceCents: number;
  discountPercent?: number | null;
}): { field: "halfDayPriceCents" | "dayPriceCents" | "discountPercent"; message: string } | null {
  if (pricing.discountPercent != null && pricing.discountPercent > MAX_DISCOUNT_PERCENT) {
    return { field: "discountPercent", message: `La remise ne peut pas dépasser ${MAX_DISCOUNT_PERCENT} %.` };
  }
  if (discountedPriceCents(pricing.halfDayPriceCents, pricing.discountPercent) < MIN_SLOT_PRICE_CENTS) {
    return { field: "halfDayPriceCents", message: MIN_PRICE_MESSAGE };
  }
  if (discountedPriceCents(pricing.dayPriceCents, pricing.discountPercent) < MIN_SLOT_PRICE_CENTS) {
    return { field: "dayPriceCents", message: MIN_PRICE_MESSAGE };
  }
  return null;
}

const priceCents = z
  .number({ error: "Le prix doit être un nombre." })
  .int("Le prix doit être exprimé en centimes entiers.")
  .min(MIN_SLOT_PRICE_CENTS, MIN_PRICE_MESSAGE)
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
  discountPercent: z
    .number()
    .int("La remise doit être un pourcentage entier.")
    .min(0, "La remise ne peut pas être négative.")
    .max(MAX_DISCOUNT_PERCENT, `La remise ne peut pas dépasser ${MAX_DISCOUNT_PERCENT} %.`)
    .nullable()
    .optional(),
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

function refinePricing(
  space: { halfDayPriceCents: number; dayPriceCents: number; discountPercent?: number | null },
  ctx: z.RefinementCtx
) {
  const violation = pricingViolation(space);
  if (violation) ctx.addIssue({ code: "custom", path: [violation.field], message: violation.message });
}

/** A new space's fields, without the property it belongs to — for routes
 * that take the property from the URL. (Zod 4 refuses `.omit()` on a
 * refined schema, hence two schemas rather than one derived from the other.) */
export const createSpaceFieldsSchema = z.object(spaceBaseFields).superRefine(refinePricing);

export const createSpaceSchema = z
  .object({
    ...spaceBaseFields,
    // The Property this Space is a unit of (Phase 4). Not optional: every new
    // space is created from a property's page, or with one picked explicitly.
    propertyId: z.uuid(),
  })
  .superRefine(refinePricing);
export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;

/** Partial: the after-discount minimum is checked here when the payload
 * carries all three pricing fields, and against the stored values in the
 * service layer otherwise (organizations/update-space.ts). */
export const updateSpaceSchema = z
  .object(spaceBaseFields)
  .partial()
  .superRefine((space, ctx) => {
    if (space.halfDayPriceCents === undefined || space.dayPriceCents === undefined) return;
    refinePricing(
      { halfDayPriceCents: space.halfDayPriceCents, dayPriceCents: space.dayPriceCents, discountPercent: space.discountPercent },
      ctx
    );
  });
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
