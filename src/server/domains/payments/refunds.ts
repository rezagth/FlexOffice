import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, NotFoundError, ServiceUnavailableError, ValidationError } from "@/server/lib/errors";
import { logError } from "@/server/lib/logger";
import { getPaymentProvider } from "./get-payment-provider";
import { RefundDeclinedError, type RefundFunding } from "./provider";
import { issueInvoiceDocumentsSafely } from "@/server/domains/invoicing/issue";

/**
 * The single way money goes back to a client (disputes, cancellations).
 *
 * Funding rules decided on 06/10/2026 (see provider.ts RefundFunding):
 * - LANDLORD: the landlord bears the refund, the platform keeps its
 *   commission. The amount can never exceed what the landlord received and
 *   has not already given back.
 * - LANDLORD_AND_FEE: full refund only; the landlord's share is taken back
 *   and the platform refunds its commission.
 *
 * Before this module, refunds were issued with no transfer reversal: the
 * landlord kept the money and the platform paid every refund alone, and
 * the provider call ran inside a database transaction (audit B-02).
 *
 * Sequencing:
 * 1. Under a row lock on the payment, the ledger is re-read and a Refund
 *    row is inserted as PENDING before any money moves — two concurrent
 *    refunds cannot both pass the bounds check.
 * 2. The provider is called outside any transaction, with the Refund row
 *    id as idempotency key: a retry never refunds twice.
 * 3. The row is completed with the provider's refund id. The mock settles
 *    at once; Stripe settles through the verified refund webhook.
 */
export async function issueRefund(params: {
  paymentId: string;
  amountCents: number;
  funding: RefundFunding;
  reason: string;
  actorUserId?: string | null;
}) {
  const { paymentId, amountCents, funding, reason } = params;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError("Le montant du remboursement doit être positif.");
  }

  const refundId = randomUUID();

  const { payment } = await prisma.$transaction(async (tx) => {
    // Serializes refunds of the same payment (and the checks below).
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;

    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundError("Paiement introuvable.");
    if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED") {
      throw new ConflictError("Ce paiement n'a pas été encaissé : il n'y a rien à rembourser.");
    }

    const committed = await tx.refund.aggregate({
      where: { paymentId, status: { in: ["PENDING", "SUCCEEDED"] } },
      _sum: { amountCents: true, landlordReversalCents: true },
    });
    const alreadyRefunded = committed._sum.amountCents ?? 0;
    const alreadyReversed = committed._sum.landlordReversalCents ?? 0;

    if (alreadyRefunded + amountCents > payment.amountCents) {
      throw new ValidationError("Le remboursement dépasse le montant payé pour cette réservation.");
    }
    if (funding === "LANDLORD" && alreadyReversed + amountCents > payment.netAmountCents) {
      throw new ValidationError(
        "Ce remboursement dépasse la part versée au bailleur. Pour rembourser davantage, remboursez la totalité du paiement."
      );
    }
    if (funding === "LANDLORD_AND_FEE" && (alreadyRefunded > 0 || amountCents !== payment.amountCents)) {
      throw new ValidationError("Le remboursement avec commission ne s'applique qu'à la totalité d'un paiement non encore remboursé.");
    }

    await tx.refund.create({
      data: {
        id: refundId,
        paymentId,
        amountCents,
        reason,
        // Placeholder until the provider answers (the column is unique and
        // required); never matches a real provider id.
        providerRefundId: `pending:${refundId}`,
        status: "PENDING",
        landlordReversalCents: landlordShareOf(amountCents, funding, payment.netAmountCents),
        applicationFeeRefunded: funding === "LANDLORD_AND_FEE",
      },
    });
    return { payment };
  });

  let outcome;
  try {
    outcome = await getPaymentProvider().refundPayment({
      providerPaymentIntentId: payment.providerPaymentIntentId,
      amountCents,
      funding,
      idempotencyKey: refundId,
    });
  } catch (error) {
    if (error instanceof RefundDeclinedError) {
      // Definitive: no money moved. Callers undo what they claimed.
      await prisma.refund.update({ where: { id: refundId }, data: { status: "FAILED" } });
      logError({ event: "refund.provider_declined", error, payment_id: paymentId, refund_id: refundId });
      throw new ServiceUnavailableError("Le remboursement n'a pas pu être émis. Réessayez plus tard.");
    }
    // Ambiguous (timeout, network, 5xx): Stripe may have refunded. The row
    // stays PENDING — it still counts against the bounds, so a second
    // attempt cannot refund twice — and is settled by the refund webhook
    // (matched on our row id) or retried with the SAME idempotency key by
    // the scheduled job (retryUnconfirmedRefunds). The caller proceeds as
    // if the refund was issued.
    logError({ event: "refund.provider_outcome_unknown", error, payment_id: paymentId, refund_id: refundId });
    await recordAudit({
      event: "refund.outcome_unknown",
      actorUserId: params.actorUserId ?? null,
      organizationId: payment.organizationId,
      metadata: { paymentId, refundId, amountCents, funding },
    });
    return prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
  }

  const refund = await recordProviderAnswer(refundId, amountCents, funding, payment.netAmountCents, outcome);

  await recordAudit({
    event: "refund.issued",
    actorUserId: params.actorUserId ?? null,
    organizationId: payment.organizationId,
    metadata: {
      paymentId,
      refundId,
      amountCents,
      funding,
      landlordReversalCents: refund.landlordReversalCents,
      applicationFeeRefunded: refund.applicationFeeRefunded,
    },
  });

  return refund;
}

/** What the landlord gives back for a refund of `amountCents`: all of it
 * when they bear it (LANDLORD); their whole share when the platform also
 * refunds its commission (LANDLORD_AND_FEE, full refunds only). */
function landlordShareOf(amountCents: number, funding: RefundFunding, netAmountCents: number): number {
  return funding === "LANDLORD" ? amountCents : Math.min(netAmountCents, amountCents);
}

async function recordProviderAnswer(
  refundId: string,
  amountCents: number,
  funding: RefundFunding,
  netAmountCents: number,
  outcome: Awaited<ReturnType<ReturnType<typeof getPaymentProvider>["refundPayment"]>>
) {
  const refund = await prisma.refund.update({
    where: { id: refundId },
    data: {
      providerRefundId: outcome.providerRefundId,
      landlordReversalCents: outcome.reversedFromLandlord ? landlordShareOf(amountCents, funding, netAmountCents) : 0,
      applicationFeeRefunded: outcome.applicationFeeRefunded,
      ...(outcome.outcome === "succeeded" ? { status: "SUCCEEDED" as const } : {}),
    },
  });
  if (outcome.outcome === "succeeded") await syncPaymentRefundStatus(refund.paymentId);
  return refund;
}

/** Refunds whose provider call ended in an ambiguous error and that no
 * webhook has settled yet are retried with the same idempotency key —
 * Stripe returns the refund it already made instead of a second one. Keys
 * live 24 h at Stripe, hence the window. Run by the maintenance job. */
export async function retryUnconfirmedRefunds() {
  const now = Date.now();
  const stuck = await prisma.refund.findMany({
    where: {
      status: "PENDING",
      providerRefundId: { startsWith: "pending:" },
      createdAt: { lt: new Date(now - 10 * 60_000), gt: new Date(now - 23 * 3_600_000) },
    },
    include: { payment: true },
  });

  let retried = 0;
  for (const row of stuck) {
    const funding: RefundFunding = row.applicationFeeRefunded ? "LANDLORD_AND_FEE" : "LANDLORD";
    try {
      const outcome = await getPaymentProvider().refundPayment({
        providerPaymentIntentId: row.payment.providerPaymentIntentId,
        amountCents: row.amountCents,
        funding,
        idempotencyKey: row.id,
      });
      await recordProviderAnswer(row.id, row.amountCents, funding, row.payment.netAmountCents, outcome);
      retried += 1;
    } catch (error) {
      if (error instanceof RefundDeclinedError) {
        await prisma.refund.update({ where: { id: row.id }, data: { status: "FAILED" } });
      }
      logError({ event: "refund.retry_failed", error, refund_id: row.id });
    }
  }
  return { candidates: stuck.length, retried };
}

/** Payment.status follows its settled refunds: REFUNDED once they cover the
 * whole amount, PARTIALLY_REFUNDED before that. Nothing set these before. */
export async function syncPaymentRefundStatus(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return;
  const settled = await prisma.refund.aggregate({
    where: { paymentId, status: "SUCCEEDED" },
    _sum: { amountCents: true },
  });
  const refunded = settled._sum.amountCents ?? 0;
  if (refunded <= 0) return;
  await prisma.payment.updateMany({
    where: { id: paymentId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } },
    data: { status: refunded >= payment.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED" },
  });
  // A settled refund gets its credit note (lot F). Never throws.
  await issueInvoiceDocumentsSafely(paymentId);
}

/** The funding a dispute refund of `amountCents` gets: the landlord bears
 * a partial refund (up to their share); a full refund also returns the
 * commission. Anything in between is refused rather than silently split. */
export function disputeRefundFunding(
  amountCents: number,
  payment: { amountCents: number; netAmountCents: number }
): RefundFunding {
  if (amountCents === payment.amountCents) return "LANDLORD_AND_FEE";
  if (amountCents <= payment.netAmountCents) return "LANDLORD";
  throw new ValidationError(
    `Un remboursement partiel est limité à la part du bailleur (${(payment.netAmountCents / 100).toFixed(2).replace(".", ",")} €). Au-delà, remboursez la totalité.`
  );
}
