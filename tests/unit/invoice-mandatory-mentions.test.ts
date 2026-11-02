import { describe, expect, it } from "vitest";
import type { Invoice } from "@/generated/prisma/client";
import { buildInvoiceView, type InvoiceForView } from "@/server/domains/invoicing/view";

/**
 * Legal safety net: whatever else changes in the invoice layout, a B2B
 * invoice issued here must keep carrying the mentions the Code de commerce
 * and the CGI require. If one is removed, this fails before an invoice is
 * numbered (numbers are irrevocable).
 */
const base = {
  id: "inv-1",
  kind: "INVOICE",
  number: "FA-ACME-2026-1",
  issuedAt: new Date("2026-11-02T10:00:00Z"),
  seller: { name: "Acme", legalName: "Acme SAS", siret: "12345678900011", vatNumber: "FR12345678901", address: "1 rue A", postalCode: "75001", city: "Paris" },
  buyer: { name: "Client", legalName: "Client SARL", siret: "98765432100022", vatNumber: "FR98765432109", address: "2 rue B", postalCode: "69001", city: "Lyon" },
  lines: [{ description: "Mise à disposition de l'espace", detail: "2 novembre 2026, 9h-13h — 1 rue A, 75001 Paris", reference: null, totalCents: 10000 }],
  totalCents: 10000,
  netCents: 8333,
  vatCents: 1667,
  vatRateBasisPoints: 2000,
  vatExempt: false,
  serviceFeeCents: 1500,
} as unknown as InvoiceForView;

function allText(invoice: InvoiceForView): string {
  const v = buildInvoiceView(invoice);
  return [v.number, v.issuedAtLabel, ...v.seller.lines, ...v.buyer.lines, v.mandateMention ?? "", ...v.legalMentions, v.paymentMention, ...v.totals.map((t) => `${t.label} ${t.value}`), ...v.lines.map((l) => `${l.description} ${l.detail ?? ""}`)].join("\n");
}

describe("mandatory mentions on a booking invoice", () => {
  const text = allText(base);

  it("identifies both parties: legal name, address, SIRET, VAT number", () => {
    for (const expected of ["Acme SAS", "1 rue A", "12345678900011", "FR12345678901", "Client SARL", "2 rue B", "98765432100022"]) {
      expect(text).toContain(expected);
    }
  });

  it("carries the sequential number, the issue date and the service date", () => {
    expect(text).toContain("FA-ACME-2026-1");
    expect(text).toContain("2 novembre 2026");
  });

  it("shows HT, VAT rate and amount, and TTC", () => {
    const labels = buildInvoiceView(base).totals.map((t) => t.label);
    expect(labels).toEqual(["Total HT", "TVA 20 %", "Total TTC"]);
  });

  it("carries the late-payment penalties, the 40 euro recovery fee and the no-discount mention", () => {
    expect(text).toContain("pénalités");
    expect(text).toContain("40 €");
    expect(text).toContain("Pas d'escompte");
  });

  it("states the category of the operation and the billing mandate", () => {
    expect(text).toContain("Catégorie de l'opération : prestation de services.");
    expect(text).toContain("mandat de facturation");
  });

  it("carries the VAT exemption mention when the seller is exempt", () => {
    const exempt = allText({ ...base, vatExempt: true, vatCents: 0 } as InvoiceForView);
    expect(exempt).toContain("art. 293 B du CGI");
  });
});

describe("credit note and commission invoice", () => {
  it("keep the category and late-payment mentions", () => {
    for (const kind of ["CREDIT_NOTE", "COMMISSION_INVOICE"] as Invoice["kind"][]) {
      const text = allText({ ...base, kind, creditedInvoice: null } as InvoiceForView);
      expect(text).toContain("Catégorie de l'opération");
      expect(text).toContain("40 €");
    }
  });
});
