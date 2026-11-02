import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { logError, logEvent } from "@/server/lib/logger";

/**
 * Stripe events about the money leaving the platform (C5). Before this, a
 * transfer taken back by Stripe stayed "PAID" in our books and a failed bank
 * payout on the landlord's side went unnoticed.
 */

export type StripeTransferEventData = { id: string; reversed?: boolean; amount?: number; amount_reversed?: number };

export function isStripeTransferEventData(data: unknown): data is StripeTransferEventData {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as { id?: unknown }).id === "string" &&
    (data as { id: string }).id.startsWith("tr_")
  );
}

/**
 * `transfer.reversed`: the landlord's payout was taken back. The payout leaves
 * PAID for REVERSED — which the retry job never touches, so the landlord is not
 * silently paid a second time with the same idempotency key — and an
 * error-level event raises the alert. Conditional update: replaying the event
 * changes nothing.
 */
export async function recordTransferReversed(data: StripeTransferEventData): Promise<void> {
  const payout = await prisma.payout.findUnique({
    where: { providerTransferId: data.id },
    select: { id: true, organizationId: true, amountCents: true, status: true },
  });
  if (!payout) {
    logEvent({ event: "payout.reversal_unknown_transfer", provider_transfer_id: data.id });
    return;
  }

  const updated = await prisma.payout.updateMany({
    where: { id: payout.id, status: "PAID" },
    data: { status: "REVERSED", failureReason: "Virement annulé par Stripe (transfer.reversed)" },
  });
  if (updated.count === 0) return; // already handled

  await recordAudit({
    event: "payout.transfer_reversed",
    organizationId: payout.organizationId,
    metadata: {
      payoutId: payout.id,
      amountCents: payout.amountCents,
      providerTransferId: data.id,
      amountReversed: data.amount_reversed ?? null,
    },
  });
  logError({
    event: "payout.transfer_reversed",
    error: new Error("Stripe reversed a landlord transfer: manual review required."),
    payout_id: payout.id,
    organization_id: payout.organizationId,
  });
}

export type StripeBankPayoutEventData = { id: string; amount?: number; failure_code?: string | null; failure_message?: string | null };

export function isStripeBankPayoutEventData(data: unknown): data is StripeBankPayoutEventData {
  return (
    !!data &&
    typeof data === "object" &&
    typeof (data as { id?: unknown }).id === "string" &&
    (data as { id: string }).id.startsWith("po_")
  );
}

/**
 * `payout.failed` (Connect endpoint): Stripe could not pay the landlord's
 * BANK. Our Payout stays PAID — the transfer to their Stripe balance did
 * succeed — but the landlord does not have their money, so this is journaled
 * and alerted (the landlord must fix their IBAN in their Stripe dashboard).
 */
export async function recordBankPayoutFailed(data: StripeBankPayoutEventData, connectedAccountId: string | undefined) {
  const organization = connectedAccountId
    ? await prisma.organization.findFirst({ where: { stripeAccountId: connectedAccountId }, select: { id: true } })
    : null;
  await recordAudit({
    event: "stripe_connect.bank_payout_failed",
    organizationId: organization?.id ?? null,
    metadata: {
      stripePayoutId: data.id,
      stripeAccountId: connectedAccountId ?? null,
      amountCents: data.amount ?? null,
      failureCode: data.failure_code ?? null,
    },
  });
  logError({
    event: "stripe_connect.bank_payout_failed",
    error: new Error("A landlord's bank payout failed on Stripe: the landlord must fix their bank details."),
    organization_id: organization?.id,
    failure_code: data.failure_code ?? undefined,
  });
}
