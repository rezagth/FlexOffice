import { SITE_NAME } from "@/lib/site";

/**
 * Invoicing settings — every business assumption the owner has not decided
 * yet lives here, behind an environment variable with a documented default,
 * so the chartered accountant's answer is a configuration change rather
 * than a code change.
 *
 * ASSUMPTIONS TO BE VALIDATED BY THE ACCOUNTANT (lot F report, H1–H3):
 *   H1  Landlord prices are entered VAT included (TTC). Booking VAT is
 *       RENTAL_VAT_RATE (20 %) when the landlord has a VAT number,
 *       otherwise "TVA non applicable, art. 293 B du CGI". The platform
 *       commission is TTC at COMMISSION_VAT_RATE (20 %).
 *   H2  The client invoice is issued by MakomSpace in the name and on
 *       behalf of the landlord (billing mandate), numbered in the
 *       landlord's own series: INVOICE_NUMBER_PREFIX-<org code>-<year>-<n>.
 *   H3  The landlord receives a monthly commission invoice from the
 *       platform, series COMMISSION_INVOICE_NUMBER_PREFIX-<year>-<n>.
 *
 * Read lazily (functions, not module constants): `next build` imports every
 * module without a guaranteed environment, and tests change it per case.
 */

/** Name used in the billing-mandate mention. */
export const PLATFORM_DISPLAY_NAME = SITE_NAME;

/** H1 — prices are VAT included. Not switchable here: charging HT prices
 * would change the amount captured from the client (pricing, out of the
 * invoicing scope), so the flag documents the assumption the maths below
 * relies on rather than pretending to toggle it. */
export const LANDLORD_PRICES_INCLUDE_VAT = true;

export const VAT_EXEMPTION_MENTION = "TVA non applicable, art. 293 B du CGI";

/** B2B mentions required on every invoice (Code de commerce L.441-9,
 * L.441-10, D.441-5). The documents are issued once the card payment is
 * captured, hence "acquittée", but the mentions stay mandatory. */
export const LATE_PAYMENT_MENTION =
  "En cas de retard de paiement, des pénalités calculées au taux d'intérêt appliqué par la Banque centrale européenne à son opération de refinancement la plus récente majoré de 10 points sont exigibles de plein droit, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 € (art. L.441-10 et D.441-5 du Code de commerce). Pas d'escompte pour paiement anticipé.";

export function billingMandateMention(landlordLegalName: string): string {
  return `Facture émise par ${PLATFORM_DISPLAY_NAME} au nom et pour le compte de ${landlordLegalName} en vertu d'un mandat de facturation.`;
}

export type InvoicingConfig = {
  /** Basis points: 2000 = 20 %. */
  rentalVatRateBp: number;
  commissionVatRateBp: number;
  invoicePrefix: string;
  commissionInvoicePrefix: string;
};

function env(name: string): string | undefined {
  // "" means absent, same convention as the rest of the codebase.
  return process.env[name]?.trim() || undefined;
}

/** "20", "5.5", "0" → basis points. Anything else is a configuration
 * error: an invoice must never be issued at a guessed rate. */
export function parsePercentToBasisPoints(name: string, raw: string | undefined, fallbackPercent: number): number {
  if (raw === undefined) return Math.round(fallbackPercent * 100);
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(raw)) {
    throw new Error(`${name} must be a percentage such as "20" or "5.5"`);
  }
  const basisPoints = Math.round(Number(raw.replace(",", ".")) * 100);
  if (basisPoints > 10000) throw new Error(`${name} must be between 0 and 100`);
  return basisPoints;
}

function parsePrefix(name: string, raw: string | undefined, fallback: string): string {
  const value = raw ?? fallback;
  if (!/^[A-Z0-9]{1,8}$/.test(value)) {
    throw new Error(`${name} must be 1 to 8 upper-case letters or digits`);
  }
  return value;
}

export function getInvoicingConfig(): InvoicingConfig {
  return {
    rentalVatRateBp: parsePercentToBasisPoints("RENTAL_VAT_RATE", env("RENTAL_VAT_RATE"), 20),
    commissionVatRateBp: parsePercentToBasisPoints("COMMISSION_VAT_RATE", env("COMMISSION_VAT_RATE"), 20),
    invoicePrefix: parsePrefix("INVOICE_NUMBER_PREFIX", env("INVOICE_NUMBER_PREFIX"), "F"),
    commissionInvoicePrefix: parsePrefix(
      "COMMISSION_INVOICE_NUMBER_PREFIX",
      env("COMMISSION_INVOICE_NUMBER_PREFIX"),
      "FC"
    ),
  };
}

/**
 * The platform as an invoicing party (seller of the commission invoice,
 * named in the billing mandate). These are company facts the owner has not
 * supplied yet (same list as the legal pages' <ToFill>), so a missing value
 * renders as a visible "[à compléter]" rather than an invented one.
 */
export type PlatformIdentity = {
  displayName: string;
  legalName: string;
  legalForm: string;
  shareCapital: string;
  address: string;
  siret: string;
  rcs: string;
  vatNumber: string;
  email: string;
  /** True while any field above is still a placeholder. */
  incomplete: boolean;
};

export const PLATFORM_FIELD_PLACEHOLDER = "[à compléter]";

export function getPlatformIdentity(): PlatformIdentity {
  const fields = {
    legalName: env("PLATFORM_LEGAL_NAME"),
    legalForm: env("PLATFORM_LEGAL_FORM"),
    shareCapital: env("PLATFORM_SHARE_CAPITAL"),
    address: env("PLATFORM_ADDRESS"),
    siret: env("PLATFORM_SIRET"),
    rcs: env("PLATFORM_RCS"),
    vatNumber: env("PLATFORM_VAT_NUMBER"),
    email: env("PLATFORM_BILLING_EMAIL"),
  };
  const incomplete = Object.values(fields).some((value) => value === undefined);
  return {
    displayName: PLATFORM_DISPLAY_NAME,
    legalName: fields.legalName ?? PLATFORM_FIELD_PLACEHOLDER,
    legalForm: fields.legalForm ?? PLATFORM_FIELD_PLACEHOLDER,
    shareCapital: fields.shareCapital ?? PLATFORM_FIELD_PLACEHOLDER,
    address: fields.address ?? PLATFORM_FIELD_PLACEHOLDER,
    siret: fields.siret ?? PLATFORM_FIELD_PLACEHOLDER,
    rcs: fields.rcs ?? PLATFORM_FIELD_PLACEHOLDER,
    vatNumber: fields.vatNumber ?? PLATFORM_FIELD_PLACEHOLDER,
    email: fields.email ?? PLATFORM_FIELD_PLACEHOLDER,
    incomplete,
  };
}
