import { formatCents, formatDateTime, invoiceNumber } from "@/lib/format";

type InvoiceData = {
  id: string;
  createdAt: Date;
  amountCents: number;
  commissionAmountCents: number;
  netAmountCents: number;
  organization: { name: string; email: string; address: string; city: string; postalCode: string };
  booking: {
    startsAt: Date;
    endsAt: Date;
    space: { name: string };
    clientUser: { name: string; email: string };
  };
};

/**
 * Printable invoice — one Payment, formatted. Not a new object to keep in
 * sync with Payment: everything here is read straight off it and its
 * booking, at render time.
 *
 * `@media print` hides the surrounding dashboard chrome so what prints is
 * the invoice alone, not the sidebar and nav around it.
 */
export function InvoiceDocument({ payment }: { payment: InvoiceData }) {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-background p-8 text-sm print:border-0 print:p-0">
      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <p className="text-lg font-semibold text-foreground">Facture</p>
          <p className="text-muted-foreground">{invoiceNumber(payment)}</p>
        </div>
        <p className="text-muted-foreground">{formatDateTime(payment.createdAt)}</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Émetteur</p>
          <p className="font-medium text-foreground">{payment.organization.name}</p>
          <p className="text-muted-foreground">
            {payment.organization.address}, {payment.organization.postalCode}{" "}
            {payment.organization.city}
          </p>
          <p className="text-muted-foreground">{payment.organization.email}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Client</p>
          <p className="font-medium text-foreground">{payment.booking.clientUser.name}</p>
          <p className="text-muted-foreground">{payment.booking.clientUser.email}</p>
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2">Prestation</th>
            <th className="py-2">Période</th>
            <th className="py-2 text-right">Montant</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <td className="py-2 text-foreground">{payment.booking.space.name}</td>
            <td className="py-2 text-muted-foreground">
              {formatDateTime(payment.booking.startsAt)} → {formatDateTime(payment.booking.endsAt)}
            </td>
            <td className="py-2 text-right text-foreground">{formatCents(payment.amountCents)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 ml-auto flex max-w-xs flex-col gap-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Montant total</span>
          <span className="text-foreground">{formatCents(payment.amountCents)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Commission OfficeFlex</span>
          <span className="text-foreground">{formatCents(payment.commissionAmountCents)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1 font-medium">
          <span>Net reversé au bailleur</span>
          <span>{formatCents(payment.netAmountCents)}</span>
        </div>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        OfficeFlex agit en tant qu&apos;intermédiaire technique de mise en relation.
        Cette facture est générée automatiquement à partir de l&apos;enregistrement du
        paiement et ne constitue pas un document comptable au sens de la
        numérotation séquentielle légale.
      </p>
    </div>
  );
}
