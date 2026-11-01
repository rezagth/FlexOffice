import { prisma } from "@/server/db/prisma";
import { centsToDecimal, toCsv } from "@/server/domains/invoicing/csv";
import { missingTaxInfo, quarterOf, TAX_INFO_SELECT } from "./tax-info";

/**
 * Yearly DAC7 working file for the accountant: one row per landlord and
 * quarter, from the payouts actually PAID in the year (paidAt), with the
 * identity data and the addresses of the properties. The declaration itself
 * is made by the accountant; this file is its input, with a column telling
 * which landlords still lack identity data.
 *
 * The amount is what was paid to the landlord (net of the platform's fees);
 * whether the declaration wants gross or net is for the accountant to decide.
 */
export async function buildDac7Csv(year: number): Promise<string> {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));

  const payouts = await prisma.payout.findMany({
    where: { status: "PAID", paidAt: { gte: from, lt: to } },
    select: {
      paidAt: true,
      organizationId: true,
      lines: { where: { kind: "EARNING" }, select: { amountCents: true, bookingId: true, booking: { select: { space: { select: { address: true, postalCode: true, city: true } } } } } },
    },
  });

  type Bucket = { cents: number; bookings: Set<string>; addresses: Set<string> };
  const buckets = new Map<string, Bucket>();
  for (const payout of payouts) {
    if (!payout.paidAt) continue;
    const key = `${payout.organizationId}|${quarterOf(payout.paidAt)}`;
    const bucket = buckets.get(key) ?? { cents: 0, bookings: new Set<string>(), addresses: new Set<string>() };
    for (const line of payout.lines) {
      bucket.cents += line.amountCents;
      bucket.bookings.add(line.bookingId);
      const a = line.booking.space;
      bucket.addresses.add(`${a.address}, ${a.postalCode} ${a.city}`);
    }
    buckets.set(key, bucket);
  }

  const organizationIds = [...new Set([...buckets.keys()].map((k) => k.split("|")[0]))];
  const organizations = await prisma.organization.findMany({
    where: { id: { in: organizationIds } },
    select: {
      id: true,
      name: true,
      legalName: true,
      vatNumber: true,
      address: true,
      city: true,
      postalCode: true,
      ...TAX_INFO_SELECT,
    },
    orderBy: { name: "asc" },
  });

  const rows: string[][] = [
    [
      "Année", "Trimestre", "Nom", "Raison sociale", "Type", "SIREN", "SIRET", "N° TVA", "Pays de résidence fiscale",
      "N° d'identification fiscale", "Date de naissance", "Adresse", "Locations (nombre)", "Montant versé (€)",
      "Adresses des biens", "Données manquantes",
    ],
  ];
  for (const org of organizations) {
    for (const quarter of [1, 2, 3, 4]) {
      const bucket = buckets.get(`${org.id}|${quarter}`);
      if (!bucket) continue;
      rows.push([
        String(year),
        `T${quarter}`,
        org.name,
        org.legalName ?? "",
        org.holderType === "COMPANY" ? "Société" : "Particulier",
        org.siren ?? "",
        org.siret ?? "",
        org.vatNumber ?? "",
        org.taxResidenceCountry ?? "",
        org.taxIdentificationNumber ?? "",
        org.representativeBirthDate ? org.representativeBirthDate.toISOString().slice(0, 10) : "",
        `${org.address}, ${org.postalCode} ${org.city}`,
        String(bucket.bookings.size),
        centsToDecimal(bucket.cents),
        [...bucket.addresses].join(" | "),
        missingTaxInfo(org).join(", "),
      ]);
    }
  }
  return toCsv(rows);
}
