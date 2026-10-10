import { buttonClasses } from "@/components/ui/button";
import type { InvoiceView } from "@/server/domains/invoicing/view";

/**
 * An issued invoicing document (invoice, credit note, commission invoice),
 * rendered from the same InvoiceView as its PDF — the page and the download
 * cannot disagree. The document itself is immutable in the database; this
 * only formats it.
 *
 * `@media print` hides the surrounding dashboard chrome so what prints is
 * the document alone.
 */
export function InvoiceDocument({ view, pdfHref }: { view: InvoiceView; pdfHref: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-background p-8 text-sm print:border-0 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="text-lg font-semibold text-foreground">{view.title}</p>
          <p className="font-medium text-foreground">N° {view.number}</p>
          <p className="text-muted-foreground">Émise le {view.issuedAtLabel}</p>
        </div>
        <a
          href={pdfHref}
          download
          className={buttonClasses("outline", "sm", "print:hidden")}
        >
          Télécharger le PDF
        </a>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {[view.seller, view.buyer].map((party) => (
          <div key={party.heading}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{party.heading}</p>
            {party.lines.map((line, index) => (
              <p key={index} className={index === 0 ? "font-medium text-foreground" : "text-muted-foreground"}>
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>

      {(view.mandateMention || view.creditedReference) && (
        <div className="mt-6 flex flex-col gap-1 rounded-lg bg-muted p-3 text-xs text-foreground">
          {view.mandateMention && <p>{view.mandateMention}</p>}
          {view.creditedReference && <p className="font-medium">{view.creditedReference}</p>}
        </div>
      )}

      <table className="mt-6 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2">Désignation</th>
            <th className="py-2 text-right">Montant TTC</th>
          </tr>
        </thead>
        <tbody>
          {view.lines.map((line, index) => (
            <tr key={index} className="border-b border-border align-top">
              <td className="py-2 pr-4">
                <p className="text-foreground">{line.description}</p>
                {line.detail && <p className="text-xs text-muted-foreground">{line.detail}</p>}
                {line.reference && <p className="text-xs text-muted-foreground">{line.reference}</p>}
              </td>
              <td className="py-2 text-right whitespace-nowrap text-foreground">{line.amountLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-4 ml-auto flex max-w-xs flex-col gap-1">
        {view.totals.map((total) => (
          <div
            key={total.label}
            className={total.strong ? "flex justify-between border-t border-border pt-1 font-medium" : "flex justify-between"}
          >
            <dt className={total.strong ? "" : "text-muted-foreground"}>{total.label}</dt>
            <dd className="text-foreground">{total.value}</dd>
          </div>
        ))}
        {view.serviceFeeLabel && <p className="text-xs text-muted-foreground">{view.serviceFeeLabel}</p>}
      </dl>

      <div className="mt-8 flex flex-col gap-2 text-xs text-muted-foreground">
        <p className="text-foreground">{view.paymentMention}</p>
        {view.legalMentions.map((mention) => (
          <p key={mention}>{mention}</p>
        ))}
        {view.footer.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}
