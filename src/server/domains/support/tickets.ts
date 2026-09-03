import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { NotFoundError } from "@/server/lib/errors";
import type { CreateTicketInput } from "@/lib/validation/support";

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

  return ticket;
}

export async function listTickets() {
  return prisma.supportTicket.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
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
