import type { Invoice } from "@/generated/prisma/client";
import { formatCents } from "@/lib/format";
import {
  getPlatformIdentity,
  LATE_PAYMENT_MENTION,
  PLATFORM_DISPLAY_NAME,
  VAT_EXEMPTION_MENTION,
  billingMandateMention,
  type PlatformIdentity,
} from "./config";
import { ACCOUNTING_TIMEZONE } from "./paris-time";
import { parseLines, parseParty, partyLegalName, type PartySnapshot } from "./types";
import { formatVatRate } from "./vat";

/**
 * One presentation model per document, shared by the HTML page and the PDF
 * so the two can never disagree: both render exactly these strings.
 */
export type InvoiceView = {
  id: string;
  kind: Invoice["kind"];
  title: string;
  number: string;
  issuedAtLabel: string;
  seller: { heading: string; lines: string[] };
  buyer: { heading: string; lines: string[] };
  /** Billing-mandate mention (booking invoice and credit note). */
  mandateMention: string | null;
  /** "Avoir sur la facture n° …" */
  creditedReference: string | null;
  lines: { description: string; detail: string | null; reference: string | null; amountLabel: string }[];
  totals: { label: string; value: string; strong?: boolean }[];
  /** "dont frais de service MakomSpace". */
  serviceFeeLabel: string | null;
  paymentMention: string;
  legalMentions: string[];
  footer: string[];
  pdfFileName: string;
};

export type InvoiceForView = Invoice & {
  creditedInvoice?: Pick<Invoice, "number" | "issuedAt"> | null;
};

const TITLES: Record<Invoice["kind"], string> = {
  INVOICE: "Facture",
  CREDIT_NOTE: "Avoir",
  COMMISSION_INVOICE: "Facture de commission",
};

export function formatIssueDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: ACCOUNTING_TIMEZONE });
}

function partyLines(party: PartySnapshot, options: { company: boolean }): string[] {
  const lines: string[] = [partyLegalName(party)];
  if (party.legalName && party.legalName !== party.name) lines.push(`Nom commercial : ${party.name}`);
  if (party.organizationName) lines.push(party.organizationName);
  if (party.address) lines.push(party.address);
  if (party.postalCode || party.city) lines.push([party.postalCode, party.city].filter(Boolean).join(" "));
  if (party.siret) lines.push(`SIRET : ${party.siret}`);
  if (options.company) lines.push(`N° TVA intracommunautaire : ${party.vatNumber || "non communiqué"}`);
  else if (party.vatNumber) lines.push(`N° TVA intracommunautaire : ${party.vatNumber}`);
  if (party.email) lines.push(party.email);
  return lines;
}

function platformLines(platform: PlatformIdentity): string[] {
  return [
    `${platform.legalName} (${PLATFORM_DISPLAY_NAME})`,
    `${platform.legalForm} au capital de ${platform.shareCapital}`,
    platform.address,
    `SIRET : ${platform.siret} — RCS ${platform.rcs}`,
    `N° TVA intracommunautaire : ${platform.vatNumber}`,
    platform.email,
  ];
}

/** Negative for a credit note: it reduces what was invoiced. */
function signed(kind: Invoice["kind"], cents: number): string {
  return formatCents(kind === "CREDIT_NOTE" ? -cents : cents);
}

export function buildInvoiceView(invoice: InvoiceForView): InvoiceView {
  const platform = getPlatformIdentity();
  const seller = parseParty(invoice.seller);
  const buyer = parseParty(invoice.buyer) ?? { name: "—" };
  const isCommission = invoice.kind === "COMMISSION_INVOICE";
  const sellerName = seller ? partyLegalName(seller) : platform.legalName;

  const totals: InvoiceView["totals"] = [{ label: "Total HT", value: signed(invoice.kind, invoice.netCents) }];
  if (invoice.vatExempt) {
    totals.push({ label: "TVA", value: signed(invoice.kind, 0) });
  } else {
    totals.push({ label: `TVA ${formatVatRate(invoice.vatRateBasisPoints)}`, value: signed(invoice.kind, invoice.vatCents) });
  }
  totals.push({ label: "Total TTC", value: signed(invoice.kind, invoice.totalCents), strong: true });

  const mandateMention = isCommission
    ? null
    : invoice.kind === "CREDIT_NOTE"
      ? billingMandateMention(sellerName).replace(/^Facture émise/, "Avoir émis")
      : billingMandateMention(sellerName);

  const creditedReference =
    invoice.kind === "CREDIT_NOTE" && invoice.creditedInvoice
      ? `Avoir sur la facture n° ${invoice.creditedInvoice.number} du ${formatIssueDate(invoice.creditedInvoice.issuedAt)}.`
      : null;

  const serviceFeeLabel =
    invoice.serviceFeeCents && invoice.serviceFeeCents > 0
      ? invoice.kind === "CREDIT_NOTE"
        ? `dont frais de service ${PLATFORM_DISPLAY_NAME} remboursés : ${formatCents(invoice.serviceFeeCents)} TTC`
        : `dont frais de service ${PLATFORM_DISPLAY_NAME} : ${formatCents(invoice.serviceFeeCents)} TTC`
      : null;

  const paymentMention = {
    INVOICE: `Facture acquittée le ${formatIssueDate(invoice.issuedAt)}, réglée par carte bancaire via ${PLATFORM_DISPLAY_NAME}.`,
    CREDIT_NOTE: `Montant remboursé sur le moyen de paiement d'origine.`,
    COMMISSION_INVOICE: `Facture acquittée : la commission a été prélevée lors de l'encaissement de chaque réservation (paiement fractionné), aucun règlement complémentaire n'est dû.`,
  }[invoice.kind];

  const legalMentions = [
    ...(invoice.vatExempt ? [VAT_EXEMPTION_MENTION] : []),
    LATE_PAYMENT_MENTION,
  ];

  const footer = isCommission
    ? [`${platform.legalName} — ${platform.legalForm} au capital de ${platform.shareCapital} — RCS ${platform.rcs} — SIRET ${platform.siret}`]
    : [
        `Document établi par ${PLATFORM_DISPLAY_NAME} (${platform.legalName}), plateforme d'intermédiation, pour le compte de l'émetteur désigné ci-dessus.`,
      ];

  return {
    id: invoice.id,
    kind: invoice.kind,
    title: TITLES[invoice.kind],
    number: invoice.number,
    issuedAtLabel: formatIssueDate(invoice.issuedAt),
    seller: {
      heading: isCommission ? "Émetteur" : "Émetteur (bailleur)",
      lines: seller ? partyLines(seller, { company: true }) : platformLines(platform),
    },
    buyer: {
      heading: isCommission ? "Destinataire (bailleur)" : "Client",
      lines: partyLines(buyer, { company: isCommission }),
    },
    mandateMention,
    creditedReference,
    lines: parseLines(invoice.lines).map((line) => ({
      description: line.description,
      detail: line.detail ?? null,
      reference: line.reference ? `Réf. ${line.reference}` : null,
      amountLabel: signed(invoice.kind, line.totalCents),
    })),
    totals,
    serviceFeeLabel,
    paymentMention,
    legalMentions,
    footer,
    pdfFileName: `${invoice.number}.pdf`,
  };
}
