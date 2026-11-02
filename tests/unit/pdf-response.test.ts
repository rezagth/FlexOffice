import { beforeEach, describe, expect, it, vi } from "vitest";

const buildInvoiceView = vi.fn();
const renderInvoicePdf = vi.fn();
vi.mock("@/server/domains/invoicing/view", () => ({ buildInvoiceView }));
vi.mock("@/server/domains/invoicing/pdf", () => ({ renderInvoicePdf }));

const { isUuid, invoicePdfResponse } = await import("@/server/domains/invoicing/pdf-response");

beforeEach(() => {
  vi.clearAllMocks();
  renderInvoicePdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
});

describe("isUuid", () => {
  it.each([
    "123e4567-e89b-12d3-a456-426614174000",
    "00000000-0000-0000-0000-000000000000",
    "ABCDEF12-3456-7890-ABCD-EF1234567890",
  ])("accepte %s", (v) => expect(isUuid(v)).toBe(true));

  it.each([
    "",
    "abc",
    "123e4567-e89b-12d3-a456-42661417400",
    "123e4567-e89b-12d3-a456-4266141740000",
    "123e4567e89b12d3a456426614174000",
    "123e4567-e89b-12d3-a456-42661417400g",
    "../../etc/passwd",
    "1; DROP TABLE invoices",
    " 123e4567-e89b-12d3-a456-426614174000",
    "123e4567-e89b-12d3-a456-426614174000\n",
  ])("refuse %j", (v) => expect(isUuid(v)).toBe(false));
});

describe("invoicePdfResponse", () => {
  it("renvoie un PDF en téléchargement, non mis en cache", async () => {
    buildInvoiceView.mockReturnValue({ pdfFileName: "FAC-2026-0001.pdf" });
    const res = await invoicePdfResponse({} as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="FAC-2026-0001.pdf"');
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Length")).toBe("4");
  });

  it("neutralise un nom de fichier piégé (guillemet, saut de ligne, chemin)", async () => {
    buildInvoiceView.mockReturnValue({ pdfFileName: 'FAC"\r\nX-Evil: 1/../x.pdf' });
    const res = await invoicePdfResponse({} as never);
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition.match(/"/g)).toHaveLength(2);
    expect(disposition).not.toContain("/");
  });

  it("propage une erreur de rendu (pas de faux PDF vide)", async () => {
    buildInvoiceView.mockReturnValue({ pdfFileName: "x.pdf" });
    renderInvoicePdf.mockRejectedValue(new Error("render failed"));
    await expect(invoicePdfResponse({} as never)).rejects.toThrow("render failed");
  });
});
