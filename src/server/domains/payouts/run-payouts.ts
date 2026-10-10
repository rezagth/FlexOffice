import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { logError, logEvent } from "@/server/lib/logger";
import { getPaymentProvider } from "@/server/domains/payments/get-payment-provider";
import { sendPayoutPaid } from "@/server/domains/notifications/send-payout-emails";
import { dueBoundary } from "./schedule";
import { OPEN_DISPUTE_STATUSES, OPEN_STRIPE_DISPUTE_STATUSES, syncEarningLines } from "./lines";

/** A payout whose transfer failed or never got an answer is retried after
 * this delay (same idempotency key: the provider never pays twice). */
const RETRY_AFTER_MINUTES = 10;

export type PayoutRunResult = {
  earningsCreated: number;
  created: number;
  paid: number;
  failed: number;
  waiting: number;
  carriedOver: number;
};

/**
 * The scheduled payout run (called by the maintenance job every 15 minutes;
 * a no-op most of the time).
 *
 * For every landlord with open lines (earnings and penalties not yet paid):
 *   1. take the lines payable at the landlord's latest schedule boundary
 *      (Monday or the 1st, per the landlord's choice, Europe/Paris);
 *   2. if the total is positive, create ONE payout for that boundary — the
 *      unique key (organization, boundary) makes a second run harmless —
 *      attach the lines to it and transfer the money;
 *   3. if the total is zero or negative (penalties exceed earnings), nothing
 *      is paid and the lines carry over to the next boundary;
 *   4. a landlord whose payout account is not ready waits: nothing is lost,
 *      the lines stay open.
 */
export async function runDuePayouts(now: Date = new Date()): Promise<PayoutRunResult> {
  const result: PayoutRunResult = { earningsCreated: 0, created: 0, paid: 0, failed: 0, waiting: 0, carriedOver: 0 };

  result.earningsCreated = (await syncEarningLines(now)).created;

  // 1. Payouts created earlier whose transfer is still to be made.
  const stuck = await prisma.payout.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      updatedAt: { lt: new Date(now.getTime() - RETRY_AFTER_MINUTES * 60_000) },
    },
    include: { organization: { select: { stripeAccountId: true, name: true, email: true } } },
  });
  for (const payout of stuck) {
    const outcome = await transferPayout(payout.id, payout.amountCents, payout.organization.stripeAccountId);
    if (outcome === "paid") result.paid += 1;
    else if (outcome === "failed") result.failed += 1;
    else result.waiting += 1;
  }

  // 2. New payouts.
  const organizations = await prisma.organization.findMany({
    where: { payoutLines: { some: { payoutId: null } } },
    select: { id: true, payoutFrequency: true, stripeAccountId: true },
  });

  for (const organization of organizations) {
    const boundary = dueBoundary(organization.payoutFrequency, now);

    const lines = await prisma.payoutLine.findMany({
      where: {
        organizationId: organization.id,
        payoutId: null,
        eligibleAt: { lte: boundary },
        // A dispute raised after the earning was recorded holds it back too.
        booking: {
          disputes: { none: { status: { in: [...OPEN_DISPUTE_STATUSES] } } },
          NOT: { payment: { stripeDisputes: { some: { status: { in: [...OPEN_STRIPE_DISPUTE_STATUSES] } } } } },
        },
      },
      select: { id: true, amountCents: true },
    });
    if (lines.length === 0) continue;
    const total = lines.reduce((sum, line) => sum + line.amountCents, 0);
    if (total <= 0) {
      result.carriedOver += 1;
      continue;
    }

    // The landlord cannot be paid until their payout account is ready.
    try {
      await getPaymentProvider().assertConnectedAccountCanBeCharged(organization.stripeAccountId);
    } catch {
      logEvent({ event: "payout.waiting_for_account", organization_id: organization.id, amount_cents: total });
      result.waiting += 1;
      continue;
    }

    let payoutId: string;
    try {
      payoutId = await prisma.$transaction(async (tx) => {
        const payout = await tx.payout.create({
          data: { organizationId: organization.id, scheduledFor: boundary, amountCents: total },
        });
        // Claim: a line already attached by a concurrent run is skipped, and
        // the total is checked against what was really claimed.
        const claimed = await tx.payoutLine.updateMany({
          where: { id: { in: lines.map((line) => line.id) }, payoutId: null },
          data: { payoutId: payout.id },
        });
        if (claimed.count !== lines.length) throw new PayoutClaimConflict();
        return payout.id;
      });
    } catch (error) {
      // Already paid (or in progress) for this boundary, or a concurrent
      // run claimed the lines: the next run picks up what is left.
      if (
        error instanceof PayoutClaimConflict ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      ) {
        continue;
      }
      logError({ event: "payout.create_failed", error, organization_id: organization.id });
      continue;
    }
    result.created += 1;

    const outcome = await transferPayout(payoutId, total, organization.stripeAccountId);
    if (outcome === "paid") result.paid += 1;
    else if (outcome === "failed") result.failed += 1;
    else result.waiting += 1;
  }

  if (result.created > 0 || result.paid > 0 || result.failed > 0) logEvent({ event: "payout.run", ...result });
  return result;
}

class PayoutClaimConflict extends Error {}

async function transferPayout(
  payoutId: string,
  amountCents: number,
  connectedAccountId: string | null
): Promise<"paid" | "failed" | "waiting"> {
  if (!connectedAccountId && getPaymentProvider().name !== "mock") return "waiting";

  const claimed = await prisma.payout.updateMany({
    where: { id: payoutId, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "PENDING", failureReason: null },
  });
  if (claimed.count === 0) return "waiting";

  try {
    const transfer = await getPaymentProvider().createTransfer({
      connectedAccountId: connectedAccountId ?? "mock",
      amountCents,
      idempotencyKey: payoutId,
      description: `Versement MakomSpace ${payoutId.slice(0, 8)}`,
    });
    const payout = await prisma.payout.update({
      where: { id: payoutId },
      data: { status: "PAID", providerTransferId: transfer.providerTransferId, paidAt: new Date() },
      include: { organization: { select: { id: true, name: true, email: true } } },
    });
    await recordAudit({
      event: "payout.paid",
      organizationId: payout.organizationId,
      metadata: { payoutId, amountCents, providerTransferId: transfer.providerTransferId },
    });
    await sendPayoutPaid({
      to: payout.organization.email,
      organizationName: payout.organization.name,
      amountCents,
      scheduledFor: payout.scheduledFor,
    });
    return "paid";
  } catch (error) {
    logError({ event: "payout.transfer_failed", error, payout_id: payoutId });
    await prisma.payout.update({
      where: { id: payoutId },
      data: { status: "FAILED", failureReason: error instanceof Error ? error.message.slice(0, 500) : "unknown" },
    });
    return "failed";
  }
}
