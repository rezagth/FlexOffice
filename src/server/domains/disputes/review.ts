import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { assertRefundFitsPayment } from "@/server/domains/payments/refund-invariants";

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
 * creates a Refund row, not just a status change. `providerRefundId` is
 * `mock_re_*` because the `PaymentProvider` interface has no `refund()`
 * method yet (see provider.ts): refunding through real Stripe is separate
 * work this does not fake. Called against a non-mock payment is refused
 * outright, honestly, rather than silently pretending success.
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
    if (payment.provider !== "mock") {
      throw new ValidationError(
        "Le remboursement via un vrai prestataire de paiement n'est pas encore implémenté."
      );
    }

    const amountCents = refundAmountCents ?? payment.amountCents;
    await assertRefundFitsPayment({ paymentId: payment.id, amountCents });

    // Interactive transaction, not the array form: the updateMany's guard
    // (status still OPEN/INVESTIGATING) must be checked BEFORE the refund is
    // created, or a concurrent second resolution would create two refunds
    // for one decision — the array form sends every operation regardless of
    // what an earlier one returned.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.dispute.updateMany({
        where: { id: disputeId, status: { in: [...REVIEWABLE_STATUSES] } },
        data: { status: targetStatus, resolutionNotes: notes },
      });
      if (updated.count === 0) {
        throw new ConflictError("Ce litige n'est pas en attente de décision.");
      }
      await tx.refund.create({
        data: {
          paymentId: payment.id,
          amountCents,
          reason: notes,
          providerRefundId: `mock_re_${crypto.randomUUID()}`,
          status: "SUCCEEDED",
        },
      });
      await tx.disputeEvent.create({ data: { disputeId, status: targetStatus, note: notes } });
    });
  }

  await recordAudit({
    event: "dispute.resolved",
    actorUserId,
    metadata: { disputeId, outcome },
  });

  return { status: targetStatus };
}
