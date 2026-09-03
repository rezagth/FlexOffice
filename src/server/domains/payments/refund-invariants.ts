import { prisma } from "@/server/db/prisma";
import { NotFoundError, ValidationError } from "@/server/lib/errors";

/**
 * The refund rule the database cannot express.
 *
 * `SUM(refunds.amount_cents) <= payments.amount_cents` is an aggregate across
 * rows, so no CHECK can hold it — a CHECK sees one row at a time. Migration
 * 20260903102000 constrains what it can (`amount_cents > 0` per refund, and
 * `amount = commission + net` on the payment) and defers this one here, by
 * design and on the record.
 *
 * Called before creating a refund. Reads the payment and the existing refunds
 * from the database, never from the request: an over-refund is money leaving
 * the platform, so the numbers have to come from the ledger.
 */
export async function assertRefundFitsPayment({
  paymentId,
  amountCents,
}: {
  paymentId: string;
  amountCents: number;
}) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError("Le montant du remboursement doit être positif.");
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { amountCents: true },
  });
  if (!payment) {
    throw new NotFoundError("Paiement introuvable.");
  }

  // PENDING counts towards the total: a refund in flight is money already
  // committed, and ignoring it is how the same amount gets refunded twice.
  const alreadyRefunded = await prisma.refund.aggregate({
    where: { paymentId, status: { in: ["PENDING", "SUCCEEDED"] } },
    _sum: { amountCents: true },
  });

  const total = (alreadyRefunded._sum.amountCents ?? 0) + amountCents;
  if (total > payment.amountCents) {
    throw new ValidationError(
      "Le remboursement dépasse le montant payé pour cette réservation."
    );
  }
}
