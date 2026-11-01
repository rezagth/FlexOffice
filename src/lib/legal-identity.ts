/**
 * The publisher's identity as the legal pages print it (mentions légales,
 * CGU, CGV, confidentialité, cookies). Facts only the company can supply, read
 * from the environment so that filling them in is a configuration change, not
 * a code change — the first block is the same set as the invoices' platform
 * identity (PLATFORM_*), so the two can never disagree.
 *
 * A missing value renders as a visible highlighted placeholder (ToFill), and
 * `pnpm check:legal` lists what is still missing.
 */
export const LEGAL_FIELDS = {
  legalName: "PLATFORM_LEGAL_NAME",
  legalForm: "PLATFORM_LEGAL_FORM",
  shareCapital: "PLATFORM_SHARE_CAPITAL",
  address: "PLATFORM_ADDRESS",
  /** City and number as printed after "RCS", e.g. "Paris 123 456 789". */
  rcs: "PLATFORM_RCS",
  vatNumber: "PLATFORM_VAT_NUMBER",
  contactEmail: "PLATFORM_CONTACT_EMAIL",
  phone: "PLATFORM_PHONE",
  publicationDirector: "PLATFORM_PUBLICATION_DIRECTOR",
  /** One dedicated address for privacy requests, listing reports and claims. */
  legalEmail: "PLATFORM_LEGAL_EMAIL",
  dpo: "PLATFORM_DPO",
  mediator: "PLATFORM_MEDIATOR",
  courtCity: "PLATFORM_COURT_CITY",
} as const;

export type LegalField = keyof typeof LEGAL_FIELDS;

export function legalFieldValue(field: LegalField): string | undefined {
  // "" means absent, same convention as the rest of the codebase.
  return process.env[LEGAL_FIELDS[field]]?.trim() || undefined;
}

/** Environment variables still empty (names only, never values). */
export function missingLegalFields(): string[] {
  return (Object.keys(LEGAL_FIELDS) as LegalField[])
    .filter((field) => legalFieldValue(field) === undefined)
    .map((field) => LEGAL_FIELDS[field]);
}
