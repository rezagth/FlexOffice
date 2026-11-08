import { beforeEach, describe, expect, it, vi } from "vitest";

const payoutFindMany = vi.fn();
const orgFindMany = vi.fn();
vi.mock("@/server/db/prisma", () => ({
  prisma: { payout: { findMany: payoutFindMany }, organization: { findMany: orgFindMany } },
}));

const { buildDac7Csv } = await import("@/server/domains/organizations/dac7-export");

const space = { address: "1 rue A", postalCode: "75001", city: "Paris" };
const line = (amountCents: number, bookingId: string, s = space) => ({ amountCents, bookingId, booking: { space: s } });
const payout = (organizationId: string, paidAt: string, lines: ReturnType<typeof line>[]) => ({
  organizationId,
  paidAt: new Date(paidAt),
  lines,
});
const org = (over: Record<string, unknown> = {}) => ({
  id: "org-1",
  name: "Acme",
  legalName: "Acme SAS",
  vatNumber: "FR123",
  address: "2 rue B",
  city: "Lyon",
  postalCode: "69001",
  holderType: "COMPANY",
  siren: "123456789",
  siret: "12345678901234",
  taxResidenceCountry: "FR",
  taxIdentificationNumber: null,
  representativeBirthDate: null,
  ...over,
});

const rows = (csv: string) => csv.replace(/^﻿/, "").trim().split("\r\n");

beforeEach(() => {
  vi.clearAllMocks();
  payoutFindMany.mockResolvedValue([]);
  orgFindMany.mockResolvedValue([]);
});

describe("buildDac7Csv", () => {
  it("sans versement : seulement l'en-tête, avec BOM UTF-8", async () => {
    const csv = await buildDac7Csv(2026);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(rows(csv)).toHaveLength(1);
    expect(rows(csv)[0]).toContain("Pays de résidence fiscale");
  });

  it("ne retient que les versements PAYÉS dans l'année civile demandée (UTC)", async () => {
    await buildDac7Csv(2026);
    const where = payoutFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("PAID");
    expect(where.paidAt.gte).toEqual(new Date(Date.UTC(2026, 0, 1)));
    expect(where.paidAt.lt).toEqual(new Date(Date.UTC(2027, 0, 1)));
  });

  it("une ligne par bailleur et par trimestre, montants exacts en euros", async () => {
    payoutFindMany.mockResolvedValue([
      payout("org-1", "2026-02-10T00:00:00Z", [line(10000, "b1"), line(2550, "b2")]),
      payout("org-1", "2026-05-02T00:00:00Z", [line(999, "b3")]),
    ]);
    orgFindMany.mockResolvedValue([org()]);
    const r = rows(await buildDac7Csv(2026));
    expect(r).toHaveLength(3);
    expect(r[1]).toContain('"T1"');
    expect(r[1]).toContain('"125.50"');
    expect(r[1]).toContain('"2"');
    expect(r[2]).toContain('"T2"');
    expect(r[2]).toContain('"9.99"');
  });

  it("regroupe plusieurs versements d'un même trimestre sans double comptage des locations", async () => {
    payoutFindMany.mockResolvedValue([
      payout("org-1", "2026-01-05T00:00:00Z", [line(1000, "b1")]),
      payout("org-1", "2026-03-30T00:00:00Z", [line(1000, "b1"), line(500, "b2")]),
    ]);
    orgFindMany.mockResolvedValue([org()]);
    const r = rows(await buildDac7Csv(2026));
    expect(r[1]).toContain('"25.00"');
    expect(r[1]).toContain('"2"');
  });

  it("liste les adresses distinctes des biens", async () => {
    payoutFindMany.mockResolvedValue([
      payout("org-1", "2026-01-05T00:00:00Z", [
        line(1000, "b1"),
        line(1000, "b2", { address: "9 rue Z", postalCode: "13001", city: "Marseille" }),
        line(1000, "b3"),
      ]),
    ]);
    orgFindMany.mockResolvedValue([org()]);
    const r = rows(await buildDac7Csv(2026))[1];
    expect(r).toContain("1 rue A, 75001 Paris | 9 rue Z, 13001 Marseille");
  });

  it("signale les données fiscales manquantes d'un particulier", async () => {
    payoutFindMany.mockResolvedValue([payout("org-1", "2026-01-05T00:00:00Z", [line(1000, "b1")])]);
    orgFindMany.mockResolvedValue([org({ holderType: "INDIVIDUAL", siren: null, siret: null, taxResidenceCountry: null })]);
    const r = rows(await buildDac7Csv(2026))[1];
    expect(r).toContain("Particulier");
    expect(r).toContain("le pays de résidence fiscale");
    expect(r).toContain("la date de naissance");
  });

  it("une société française complète n'a aucune donnée manquante", async () => {
    payoutFindMany.mockResolvedValue([payout("org-1", "2026-01-05T00:00:00Z", [line(1000, "b1")])]);
    orgFindMany.mockResolvedValue([org()]);
    const r = rows(await buildDac7Csv(2026))[1];
    expect(r.endsWith(',""')).toBe(true);
  });

  it("formate la date de naissance en ISO", async () => {
    payoutFindMany.mockResolvedValue([payout("org-1", "2026-01-05T00:00:00Z", [line(1000, "b1")])]);
    orgFindMany.mockResolvedValue([
      org({ holderType: "INDIVIDUAL", taxIdentificationNumber: "T1", representativeBirthDate: new Date("1985-07-04T00:00:00Z") }),
    ]);
    expect(rows(await buildDac7Csv(2026))[1]).toContain('"1985-07-04"');
  });

  it("neutralise une formule injectée dans un nom (CSV injection)", async () => {
    payoutFindMany.mockResolvedValue([payout("org-1", "2026-01-05T00:00:00Z", [line(1000, "b1")])]);
    orgFindMany.mockResolvedValue([org({ name: '=HYPERLINK("http://evil","x")' })]);
    const r = rows(await buildDac7Csv(2026))[1];
    expect(r).toContain(`"'=HYPERLINK`);
    expect(r).not.toMatch(/(^|,)"=HYPERLINK/);
  });

  it("ignore un versement sans date de paiement", async () => {
    payoutFindMany.mockResolvedValue([{ organizationId: "org-1", paidAt: null, lines: [line(1000, "b1")] }]);
    expect(rows(await buildDac7Csv(2026))).toHaveLength(1);
  });

  it("trimestres aux frontières : 31 mars → T1, 1er avril → T2, 31 décembre → T4", async () => {
    payoutFindMany.mockResolvedValue([
      payout("org-1", "2026-03-31T12:00:00Z", [line(100, "b1")]),
      payout("org-1", "2026-04-01T12:00:00Z", [line(100, "b2")]),
      payout("org-1", "2026-12-31T12:00:00Z", [line(100, "b3")]),
    ]);
    orgFindMany.mockResolvedValue([org()]);
    const r = rows(await buildDac7Csv(2026)).slice(1).join("\n");
    expect(r).toContain('"T1"');
    expect(r).toContain('"T2"');
    expect(r).toContain('"T4"');
    expect(r).not.toContain('"T3"');
  });
});
