import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { NotFoundError } from "@/server/lib/errors";
import type { CreateTicketInput } from "@/lib/validation/support";
import {
  notifySupportReply,
  notifySupportTicketReceived,
} from "@/server/domains/notifications/send-notifications";

/**
 * Reachable without an account on purpose — a visitor blocked before
 * signing up still needs a channel. `userId` is attached when a session
 * exists, purely as a convenience for the admin reading it later; the
 * ticket is valid either way.
 */
export async function createTicket(input: CreateTicketInput, userId: string | null) {
  const ticket = await prisma.supportTicket.create({
    data: {
      userId,
      email: input.email,
      subject: input.subject,
      message: input.message,
    },
  });

  await recordAudit({
    event: "support_ticket.created",
    actorUserId: userId,
    metadata: { ticketId: ticket.id },
  });
  // Acknowledgment with the reference only — see supportTicketAckTemplate.
  await notifySupportTicketReceived(ticket);

  return ticket;
}

export async function listTickets() {
  return prisma.supportTicket.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      replies: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
}

export async function listTicketReplies(ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true } });
  if (!ticket) throw new NotFoundError("Ticket introuvable");
  return prisma.supportTicketReply.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true } } },
  });
}

/**
 * An administrator answers a ticket: the reply is stored (the history the
 * back office shows), then e-mailed to the address the ticket was opened
 * with. The e-mail is best-effort like every other one; `emailedAt` records
 * whether the provider accepted it, so a failed send is visible instead of
 * looking answered. Optionally closes the ticket in the same step.
 */
export async function replyToTicket(params: {
  ticketId: string;
  actorUserId: string;
  body: string;
  close?: boolean;
}) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: params.ticketId } });
  if (!ticket) throw new NotFoundError("Ticket introuvable");

  const reply = await prisma.supportTicketReply.create({
    data: { ticketId: ticket.id, authorProfileId: params.actorUserId, body: params.body },
  });
  await recordAudit({
    event: "support_ticket.replied",
    actorUserId: params.actorUserId,
    metadata: { ticketId: ticket.id, replyId: reply.id },
  });

  const emailed = await notifySupportReply(ticket, params.body);
  const stored = emailed
    ? await prisma.supportTicketReply.update({ where: { id: reply.id }, data: { emailedAt: new Date() } })
    : reply;

  if (params.close) await closeTicket(ticket.id, params.actorUserId);

  return { reply: stored, emailed };
}

export async function closeTicket(ticketId: string, actorUserId: string) {
  const updated = await prisma.supportTicket.updateMany({
    where: { id: ticketId, status: "OPEN" },
    data: { status: "CLOSED" },
  });
  if (updated.count === 0) {
    const exists = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!exists) throw new NotFoundError("Ticket introuvable");
    return exists; // already closed — closing again is a no-op, not an error
  }

  await recordAudit({
    event: "support_ticket.closed",
    actorUserId,
    metadata: { ticketId },
  });

  return prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
}
