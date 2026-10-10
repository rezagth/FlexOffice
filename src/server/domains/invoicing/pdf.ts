import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InvoiceView } from "./view";
import { PLATFORM_DISPLAY_NAME } from "./config";

/**
 * Server-side PDF of an invoicing document, drawn with pdf-lib and the
 * standard Helvetica fonts (no font file to ship, no network). Renders the
 * same InvoiceView as the HTML page.
 *
 * Standard fonts use WinAnsi encoding: French accents, «», €, – and — are
 * fine; the narrow no-break space that `toLocaleString("fr-FR")` puts in
 * amounts is not, hence `toWinAnsi`.
 */

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const TEXT = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);
const RULE = rgb(0.85, 0.85, 0.88);

export function toWinAnsi(text: string, font: PDFFont): string {
  const normalized = text
    .replace(/[    ]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, "->")
    .replace(/…/g, "...");
  let out = "";
  for (const char of normalized) {
    try {
      font.encodeText(char);
      out += char;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

class Cursor {
  page: PDFPage;
  y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: { regular: PDFFont; bold: PDFFont },
    private readonly footer: string[]
  ) {
    this.page = this.newPage();
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private newPage(): PDFPage {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = MARGIN - 10;
    for (const line of [...this.footer].reverse()) {
      for (const part of wrap(toWinAnsi(line, this.fonts.regular), this.fonts.regular, 7, CONTENT_WIDTH).reverse()) {
        page.drawText(part, { x: MARGIN, y, size: 7, font: this.fonts.regular, color: MUTED });
        y += 9;
      }
    }
    return page;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + 30) {
      this.page = this.newPage();
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  text(
    value: string,
    options: { size?: number; bold?: boolean; color?: typeof TEXT; x?: number; width?: number; gap?: number } = {}
  ) {
    const size = options.size ?? 9;
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const x = options.x ?? MARGIN;
    const width = options.width ?? CONTENT_WIDTH;
    for (const line of wrap(toWinAnsi(value, font), font, size, width)) {
      this.ensure(size + 3);
      this.page.drawText(line, { x, y: this.y - size, size, font, color: options.color ?? TEXT });
      this.y -= size + 3;
    }
    this.y -= options.gap ?? 0;
  }

  rightText(value: string, rightX: number, y: number, options: { size?: number; bold?: boolean } = {}) {
    const size = options.size ?? 9;
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const safe = toWinAnsi(value, font);
    this.page.drawText(safe, { x: rightX - font.widthOfTextAtSize(safe, size), y, size, font, color: TEXT });
  }

  rule() {
    this.ensure(8);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 4 },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y - 4 },
      thickness: 0.6,
      color: RULE,
    });
    this.y -= 10;
  }

  /** Two blocks side by side; the cursor ends below the taller one. */
  columns(left: { heading: string; lines: string[] }, right: { heading: string; lines: string[] }) {
    const columnWidth = CONTENT_WIDTH / 2 - 10;
    const top = this.y;
    let bottom = top;
    for (const [index, block] of [left, right].entries()) {
      this.y = top;
      const x = MARGIN + index * (columnWidth + 20);
      this.text(block.heading.toUpperCase(), { size: 7, bold: true, color: MUTED, x, width: columnWidth, gap: 2 });
      block.lines.forEach((line, i) => this.text(line, { x, width: columnWidth, bold: i === 0 }));
      bottom = Math.min(bottom, this.y);
    }
    this.y = bottom - 8;
  }
}

export async function renderInvoicePdf(view: InvoiceView): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${view.title} ${view.number}`);
  doc.setSubject(view.title);
  doc.setProducer(PLATFORM_DISPLAY_NAME);
  doc.setCreator(PLATFORM_DISPLAY_NAME);
  doc.setLanguage("fr-FR");
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const c = new Cursor(doc, fonts, view.footer);

  // Header
  c.text(view.title.toUpperCase(), { size: 18, bold: true, gap: 2 });
  c.text(`N° ${view.number}`, { size: 11, bold: true });
  c.text(`Date d'émission : ${view.issuedAtLabel}`, { color: MUTED, gap: 10 });

  c.columns(view.seller, view.buyer);

  if (view.mandateMention) c.text(view.mandateMention, { size: 8, bold: true, gap: 4 });
  if (view.creditedReference) c.text(view.creditedReference, { size: 9, bold: true, gap: 4 });
  c.rule();

  // Lines
  const amountRight = PAGE_WIDTH - MARGIN;
  const descriptionWidth = CONTENT_WIDTH - 110;
  c.ensure(14);
  c.page.drawText("DÉSIGNATION", { x: MARGIN, y: c.y - 7, size: 7, font: fonts.bold, color: MUTED });
  c.rightText("MONTANT TTC", amountRight, c.y - 7, { size: 7, bold: true });
  c.y -= 12;
  for (const line of view.lines) {
    c.ensure(24);
    const rowTop = c.y;
    c.rightText(line.amountLabel, amountRight, rowTop - 9);
    c.text(line.description, { width: descriptionWidth, bold: true });
    if (line.detail) c.text(line.detail, { width: descriptionWidth, size: 8, color: MUTED });
    if (line.reference) c.text(line.reference, { width: descriptionWidth, size: 8, color: MUTED });
    c.y -= 4;
  }
  c.rule();

  // Totals
  const labelX = PAGE_WIDTH - MARGIN - 220;
  for (const total of view.totals) {
    c.ensure(14);
    const size = total.strong ? 11 : 9;
    c.page.drawText(toWinAnsi(total.label, total.strong ? fonts.bold : fonts.regular), {
      x: labelX,
      y: c.y - size,
      size,
      font: total.strong ? fonts.bold : fonts.regular,
      color: TEXT,
    });
    c.rightText(total.value, amountRight, c.y - size, { size, bold: total.strong });
    c.y -= size + 5;
  }
  if (view.serviceFeeLabel) c.text(view.serviceFeeLabel, { x: labelX, width: 220, size: 8, color: MUTED });
  c.y -= 12;

  c.text(view.paymentMention, { gap: 6 });
  for (const mention of view.legalMentions) c.text(mention, { size: 7.5, color: MUTED, gap: 3 });

  return doc.save();
}
