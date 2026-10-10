import type { InvoiceForView } from "./view";
import { buildInvoiceView } from "./view";
import { renderInvoicePdf } from "./pdf";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id cannot name any document: answered like an unknown one
 * (404) rather than reaching the database. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** The PDF download response of a document the caller was already
 * authorized for. `private, no-store`: an invoice carries personal data and
 * must not sit in a shared cache. */
export async function invoicePdfResponse(invoice: InvoiceForView): Promise<Response> {
  const view = buildInvoiceView(invoice);
  const bytes = await renderInvoicePdf(view);
  // The number is [A-Z0-9-] by construction (numbering.ts); filtered anyway
  // so the header can never be broken by a quote or a newline.
  const fileName = view.pdfFileName.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
