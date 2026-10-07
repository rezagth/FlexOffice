import { prisma } from "@/server/db/prisma";
import { logError } from "@/server/lib/logger";
import { adminAlertRecipients, sendSafely } from "./send-safely";
import {
  chargebackReceivedTemplate,
  commissionStatementIssuedTemplate,
  disputeOpenedTemplate,
  disputeResolvedTemplate,
  newMessageTemplate,
  organizationReactivatedTemplate,
  organizationSuspendedTemplate,
  refundIssuedTemplate,
  spacePublishedTemplate,
  spaceRejectedTemplate,
  spaceUnpublishedTemplate,
  supportReplyTemplate,
  supportTicketAckTemplate,
  verificationApprovedTemplate,
  verificationRejectedTemplate,
} from "./templates";

/**
 * Notifications that need data loaded first. Same contract as
 * send-booking-emails.ts: best-effort end to end — a failed lookup is
 * logged exactly like a failed send, and nothing here ever throws into the
 * business operation that triggered it.
 */
async function bestEffort(event: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    logError({ event, error });
  }
}

/** Below this gap, a second message from the same sender in the same
 * conversation does not trigger another e-mail — a burst of short messages
 * is one notification, not ten. */
export const MESSAGE_NOTIFICATION_COOLDOWN_MS = 10 * 60 * 1000;

export function notifyNewMessage(messageId: string) {
  return bestEffort("email.new_message.failed", async () => {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            booking: { include: { clientUser: true, organization: true, space: true } },
          },
        },
      },
    });
    if (!message) return;

    const previous = await prisma.message.findFirst({
      where: { conversationId: message.conversationId, createdAt: { lt: message.createdAt } },
      orderBy: { createdAt: "desc" },
    });
    if (
      previous &&
      previous.senderUserId === message.senderUserId &&
      message.createdAt.getTime() - previous.createdAt.getTime() < MESSAGE_NOTIFICATION_COOLDOWN_MS
    ) {
      return;
    }

    const { booking } = message.conversation;
    const fromClient = message.senderUserId === booking.clientUserId;
    const to = fromClient ? booking.organization.email : booking.clientUser.email;
    if (!to || booking.clientUser.deletedAt) return;
    await sendSafely(
      () =>
        newMessageTemplate({
          to,
          senderLabel: fromClient ? booking.clientUser.name : booking.organization.name,
          spaceName: booking.space.name,
          bookingId: booking.id,
        }),
      "email.new_message.failed"
    );
  });
}

export function notifyVerificationDecision(
  verificationId: string,
  decision: { kind: "APPROVED" } | { kind: "REJECTED"; reason: string }
) {
  return bestEffort("email.verification_decision.failed", async () => {
    const verification = await prisma.landlordVerification.findUnique({
      where: { id: verificationId },
      include: { organization: true },
    });
    if (!verification) return;
    const { organization } = verification;
    await sendSafely(
      () =>
        decision.kind === "APPROVED"
          ? verificationApprovedTemplate({ to: organization.email, organizationName: organization.name })
          : verificationRejectedTemplate({
              to: organization.email,
              organizationName: organization.name,
              reason: decision.reason,
            }),
      "email.verification_decision.failed"
    );
  });
}

export function notifySpaceModeration(
  spaceId: string,
  decision: { kind: "PUBLISHED" } | { kind: "REJECTED"; reason?: string | null } | { kind: "UNPUBLISHED"; reason: string }
) {
  return bestEffort("email.space_moderation.failed", async () => {
    const space = await prisma.space.findUnique({ where: { id: spaceId }, include: { organization: true } });
    if (!space) return;
    const to = space.organization.email;
    await sendSafely(() => {
      switch (decision.kind) {
        case "PUBLISHED":
          return spacePublishedTemplate({ to, spaceName: space.name });
        case "REJECTED":
          return spaceRejectedTemplate({ to, spaceName: space.name, reason: decision.reason });
        case "UNPUBLISHED":
          return spaceUnpublishedTemplate({ to, spaceName: space.name, reason: decision.reason });
      }
    }, "email.space_moderation.failed");
  });
}

export function notifyOrganizationStatus(
  organizationId: string,
  change: { kind: "SUSPENDED"; reason: string } | { kind: "REACTIVATED" }
) {
  return bestEffort("email.organization_status.failed", async () => {
    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) return;
    await sendSafely(
      () =>
        change.kind === "SUSPENDED"
          ? organizationSuspendedTemplate({
              to: organization.email,
              organizationName: organization.name,
              reason: change.reason,
            })
          : organizationReactivatedTemplate({ to: organization.email, organizationName: organization.name }),
      "email.organization_status.failed"
    );
  });
}

async function loadDispute(disputeId: string) {
  return prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { booking: { include: { clientUser: true, organization: true, space: true } } },
  });
}

/** To both parties and to the platform operators. */
export function notifyDisputeOpened(disputeId: string) {
  return bestEffort("email.dispute_opened.failed", async () => {
    const dispute = await loadDispute(disputeId);
    if (!dispute) return;
    const { booking } = dispute;
    const raisedByClient = dispute.raisedByUserId === booking.clientUserId;
    const base = {
      spaceName: booking.space.name,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      bookingId: booking.id,
      raisedByLabel: raisedByClient ? `le client (${booking.clientUser.name})` : `l'hôte (${booking.organization.name})`,
    };
    const parties = [booking.clientUser.email, booking.organization.email];
    for (const to of new Set(parties)) {
      await sendSafely(() => disputeOpenedTemplate({ ...base, to, audience: "party" }), "email.dispute_opened.failed");
    }
    for (const to of adminAlertRecipients()) {
      await sendSafely(() => disputeOpenedTemplate({ ...base, to, audience: "admin" }), "email.dispute_opened_admin.failed");
    }
  });
}

export function notifyDisputeResolved(
  disputeId: string,
  resolution: { outcome: "REFUND" | "NO_ACTION"; notes: string; refundAmountCents?: number | null }
) {
  return bestEffort("email.dispute_resolved.failed", async () => {
    const dispute = await loadDispute(disputeId);
    if (!dispute) return;
    const { booking } = dispute;
    for (const to of new Set([booking.clientUser.email, booking.organization.email])) {
      await sendSafely(
        () => disputeResolvedTemplate({ to, spaceName: booking.space.name, ...resolution }),
        "email.dispute_resolved.failed"
      );
    }
  });
}

export function notifyRefundIssued(paymentId: string, amountCents: number) {
  return bestEffort("email.refund_issued.failed", async () => {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: { include: { clientUser: true, space: true } } },
    });
    if (!payment || payment.booking.clientUser.deletedAt) return;
    await sendSafely(
      () =>
        refundIssuedTemplate({
          to: payment.booking.clientUser.email,
          clientName: payment.booking.clientUser.name,
          spaceName: payment.booking.space.name,
          amountCents,
        }),
      "email.refund_issued.failed"
    );
  });
}

export function notifyCommissionStatementIssued(statementId: string) {
  return bestEffort("email.commission_statement.failed", async () => {
    const statement = await prisma.commissionStatement.findUnique({
      where: { id: statementId },
      include: { organization: true },
    });
    if (!statement) return;
    const periodLabel = statement.periodStart.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
      timeZone: "Europe/Paris",
    });
    await sendSafely(
      () =>
        commissionStatementIssuedTemplate({
          to: statement.organization.email,
          organizationName: statement.organization.name,
          periodLabel,
          totalCommissionAmountCents: statement.totalCommissionAmountCents,
        }),
      "email.commission_statement.failed"
    );
  });
}

/** A new Stripe chargeback: the landlord whose space it concerns, and the
 * platform operators (who answer it in the Stripe dashboard). */
export function notifyChargebackReceived(stripeDisputeId: string) {
  return bestEffort("email.chargeback_received.failed", async () => {
    const dispute = await prisma.stripeDispute.findUnique({
      where: { id: stripeDisputeId },
      include: { payment: { include: { organization: true, booking: { include: { space: true } } } } },
    });
    if (!dispute) return;
    const base = {
      organizationName: dispute.payment.organization.name,
      spaceName: dispute.payment.booking.space.name,
      amountCents: dispute.amountCents,
      reason: dispute.reason,
    };
    await sendSafely(
      () => chargebackReceivedTemplate({ ...base, to: dispute.payment.organization.email, audience: "landlord" }),
      "email.chargeback_received.failed"
    );
    for (const to of adminAlertRecipients()) {
      await sendSafely(
        () => chargebackReceivedTemplate({ ...base, to, audience: "admin" }),
        "email.chargeback_received_admin.failed"
      );
    }
  });
}

export function notifySupportTicketReceived(ticket: { id: string; email: string }) {
  return sendSafely(
    () => supportTicketAckTemplate({ to: ticket.email, ticketId: ticket.id }),
    "email.support_ticket_ack.failed"
  );
}

export function notifySupportReply(ticket: { id: string; email: string; subject: string }, reply: string) {
  return sendSafely(
    () => supportReplyTemplate({ to: ticket.email, ticketId: ticket.id, subject: ticket.subject, reply }),
    "email.support_reply.failed"
  );
}
