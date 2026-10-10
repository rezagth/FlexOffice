/**
 * CSV helpers for the accounting export.
 *
 * SEC-14 — CSV/formula injection: a cell starting with = + - @, a tab or a
 * carriage return is evaluated as a formula by Excel / LibreOffice / Sheets.
 * Space names and client names are typed by users, so `=HYPERLINK(...)` in
 * a space name would run in the landlord's spreadsheet. Such cells are
 * prefixed with a single quote (OWASP recommendation), which spreadsheets
 * display as text.
 *
 * Numbers we generate ourselves ("-12.50", a negative kept commission) are
 * the one exception: they are written by `centsToDecimal`, never contain a
 * formula, and prefixing them would turn every amount into text.
 */

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function neutralizeFormula(value: string): string {
  if (PLAIN_NUMBER.test(value)) return value;
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value;
}

export function csvCell(value: string | number | null | undefined): string {
  const text = neutralizeFormula(value === null || value === undefined ? "" : String(value));
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  // CRLF line endings (RFC 4180) and a UTF-8 BOM so Excel reads the
  // accents correctly.
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Integer cents → "1234.56", exact (no floating point division). */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
