import { z } from "zod";

// Deliberately narrow: only the client's *intent* (which space, which
// calendar day, which named slot, how many people, why) is ever accepted.
// No price, duration, or raw start/end time — those are always computed
// server-side from the space and its opening hours (see create-booking.ts).
export const createBookingSchema = z.object({
  spaceId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : YYYY-MM-DD"),
  slot: z.enum(["MORNING", "AFTERNOON", "FULL_DAY"]),
  participantsCount: z.number().int().min(1).max(1000),
  purpose: z.string().trim().min(1).max(500),
  // B-11: the CGV box must be ticked before the request is sent. Only the
  // fact of accepting comes from the client — the version and the date are
  // stamped by the server (create-booking.ts, legal-versions.ts).
  acceptTerms: z.literal(true, { error: "Vous devez accepter les conditions générales de vente." }),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
