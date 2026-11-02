import type { HolderType } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import type { TaxInfoInput } from "@/lib/validation/tax-info";

/**
 * DAC7 — a platform that lets people rent out immovable property must collect
 * the seller's tax identity and report what they were paid each year. The
 * data is required BEFORE the first payout (run-payouts.ts holds a landlord's
 * money, never loses it, until this is complete).
 *
 * What counts as complete:
 *  - everyone: country of tax residence;
 *  - a company: a tax identification number, or — for a French company — its
 *    SIREN/SIRET, which already identifies it;
 *  - an individual: tax identification number AND representative's birth date.
 */
export type TaxInfoSource = {
  holderType: HolderType;
  siren: string | null;
  siret: string | null;
  taxResidenceCountry: string | null;
  taxIdentificationNumber: string | null;
  representativeBirthDate: Date | null;
};

export function missingTaxInfo(org: TaxInfoSource): string[] {
  const missing: string[] = [];
  const country = org.taxResidenceCountry?.trim().toUpperCase() ?? "";
  if (!country) missing.push("le pays de résidence fiscale");

  const hasTin = Boolean(org.taxIdentificationNumber?.trim());
  if (org.holderType === "COMPANY") {
    const frenchIdentifier = country === "FR" && Boolean(org.siren?.trim() || org.siret?.trim());
    if (!hasTin && !frenchIdentifier) missing.push("le numéro d'identification fiscale");
  } else {
    if (!hasTin) missing.push("le numéro d'identification fiscale");
    if (!org.representativeBirthDate) missing.push("la date de naissance");
  }
  return missing;
}

export function isTaxInfoComplete(org: TaxInfoSource): boolean {
  return missingTaxInfo(org).length === 0;
}

export const TAX_INFO_SELECT = {
  holderType: true,
  siren: true,
  siret: true,
  taxResidenceCountry: true,
  taxIdentificationNumber: true,
  representativeBirthDate: true,
} as const;

export async function saveTaxInfo(organizationId: string, actorUserId: string, input: TaxInfoInput) {
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      taxResidenceCountry: input.taxResidenceCountry,
      taxIdentificationNumber: input.taxIdentificationNumber ?? null,
      representativeBirthDate: input.representativeBirthDate ? new Date(`${input.representativeBirthDate}T00:00:00Z`) : null,
    },
  });
  // The values themselves stay out of the audit log: it is read widely.
  await recordAudit({ event: "organization.tax_info_updated", actorUserId, organizationId });
}

/** Calendar quarter (1-4) of a date, in UTC. */
export function quarterOf(date: Date): 1 | 2 | 3 | 4 {
  return (Math.floor(date.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}
