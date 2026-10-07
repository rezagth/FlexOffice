import { z } from "zod";

/**
 * Shapes of the JSON snapshots stored on an `Invoice` (seller, buyer,
 * lines). Validated on read: the columns are JSONB, so the type system
 * alone cannot vouch for what a row holds.
 */
export const partySnapshotSchema = z.object({
  /** Trading or person name. */
  name: z.string(),
  /** Registered company name, when it differs from `name`. */
  legalName: z.string().nullish(),
  siret: z.string().nullish(),
  vatNumber: z.string().nullish(),
  address: z.string().nullish(),
  postalCode: z.string().nullish(),
  city: z.string().nullish(),
  email: z.string().nullish(),
  /** Buyer side: the company the client books for, when known. */
  organizationName: z.string().nullish(),
});
export type PartySnapshot = z.infer<typeof partySnapshotSchema>;

export const invoiceLineSchema = z.object({
  description: z.string(),
  /** Second line: date and slot, address, motive… */
  detail: z.string().nullish(),
  /** Related document, e.g. the booking invoice a commission line is on. */
  reference: z.string().nullish(),
  /** VAT included. */
  totalCents: z.number().int(),
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

export function parseParty(value: unknown): PartySnapshot | null {
  if (value === null || value === undefined) return null;
  return partySnapshotSchema.parse(value);
}

export function parseLines(value: unknown): InvoiceLine[] {
  return z.array(invoiceLineSchema).parse(value);
}

/** Display name of a party: the registered name first. */
export function partyLegalName(party: PartySnapshot): string {
  return party.legalName?.trim() || party.name;
}
