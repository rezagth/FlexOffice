import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { assertRefundFitsPayment } from "@/server/domains/payments/refund-invariants";
import { disputeRefundFunding, issueRefund } from "@/server/domains/payments/refunds";
import { notifyDisputeResolved, notifyRefundIssued } from "@/server/domains/notifications/send-notifications";

const REVIEWABLE_STATUSES = ["OPEN", "INVESTIGATING"] as const;

async function loadDisputeOrThrow(disputeId: string) {
  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute) throw new NotFoundError("Litige introuvable");
  return dispute;
}

/** OPEN -> INVESTIGATING. Marks that an admin has started looking. */
export async function takeChargeOfDispute(disputeId: string, actorUserId: string) {
  const dispute = await loadDisputeOrThrow(disputeId);

  const updated = await prisma.$transaction([
    prisma.dispute.updateMany({
      where: { id: disputeId, status: "OPEN" },
      data: { status: "INVESTIGATING" },
    }),
    prisma.disputeEvent.create({
      data: { disputeId, status: "INVESTIGATING" },
    }),
  ]);
  if (updated[0].count === 0) {
    throw new ConflictError("Ce litige n'est pas en attente de prise en charge.");
  }

  await recordAudit({
    event: "dispute.taken_in_charge",
    actorUserId,
    metadata: { disputeId },
  });

  return dispute;
}

/**
 * Resolves a litige: either RESOLVED_NO_ACTION, or RESOLVED_REFUND — which
 * creates a Refund row, not just a status change. The actual refund is
 * issued through whichever PaymentProvider is configured (mock or Stripe) —
 * see provider.ts. The provider call happens only after the dispute row has
 * been atomically claimed (see below), so a concurrent second resolution
 * can never reach the provider a second time for the same dispute.
 */
export async function resolveDispute({
  disputeId,
  actorUserId,
  outcome,
  notes,
  refundAmountCents,
}: {
  disputeId: string;
  actorUserId: string;
  outcome: "REFUND" | "NO_ACTION";
  notes: string;
  refundAmountCents?: number;
}) {
  const dispute = await loadDisputeOrThrow(disputeId);
  if (!REVIEWABLE_STATUSES.includes(dispute.status as (typeof REVIEWABLE_STATUSES)[number])) {
    throw new ConflictError("Ce litige n'est pas en attente de décision.");
  }

  const targetStatus = outcome === "REFUND" ? "RESOLVED_REFUND" : "RESOLVED_NO_ACTION";
  let refunded: { paymentId: string; amountCents: number } | null = null;

  if (outcome === "NO_ACTION") {
    const updated = await prisma.$transaction([
      prisma.dispute.updateMany({
        where: { id: disputeId, status: { in: [...REVIEWABLE_STATUSES] } },
        data: { status: targetStatus, resolutionNotes: notes },
      }),
      prisma.disputeEvent.create({ data: { disputeId, status: targetStatus, note: notes } }),
    ]);
    if (updated[0].count === 0) {
      throw new ConflictError("Ce litige n'est pas en attente de décision.");
    }
  } else {
    const payment = await prisma.payment.findUnique({ where: { bookingId: dispute.bookingId } });
    if (!payment) {
      throw new ValidationError("Aucun paiement associé à cette réservation.");
    }

    const amountCents = refundAmountCents ?? payment.amountCents;
    // Validates the amount against the ledger and decides who funds it,
    // before the dispute is claimed (so a refused amount changes nothing).
    const funding = disputeRefundFunding(amountCents, payment);
    await assertRefundFitsPayment({ paymentId: payment.id, amountCents });

    // Claim the dispute first, in its own short transaction: a concurrent
    // second resolution sees the status already changed and never reaches
    // the refund. The money moves outside any transaction (issueRefund).
    const claimed = await prisma.dispute.updateMany({
      where: { id: disputeId, status: { in: [...REVIEWABLE_STATUSES] } },
      data: { status: targetStatus, resolutionNotes: notes },
    });
    if (claimed.count === 0) {
      throw new ConflictError("Ce litige n'est pas en attente de décision.");
    }

    try {
      await issueRefund({ paymentId: payment.id, amountCents, funding, reason: notes, actorUserId });
    } catch (error) {
      // No money moved (issueRefund marks its row FAILED): give the dispute
      // back to the admin instead of leaving it "resolved" without refund.
      await prisma.dispute.updateMany({
        where: { id: disputeId, status: targetStatus },
        data: { status: dispute.status, resolutionNotes: dispute.resolutionNotes ?? null },
      });
      throw error;
    }
    await prisma.disputeEvent.create({ data: { disputeId, status: targetStatus, note: notes } });
    refunded = { paymentId: payment.id, amountCents };
  }

  await recordAudit({
    event: "dispute.resolved",
    actorUserId,
    metadata: { disputeId, outcome },
  });

  await notifyDisputeResolved(disputeId, {
    outcome,
    notes,
    refundAmountCents: refunded?.amountCents ?? null,
  });
  if (refunded) await notifyRefundIssued(refunded.paymentId, refunded.amountCents);

  return { status: targetStatus };
}
