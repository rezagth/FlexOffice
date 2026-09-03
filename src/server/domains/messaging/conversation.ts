import { prisma } from "@/server/db/prisma";
import { NotFoundError } from "@/server/lib/errors";

/**
 * Every function here re-derives the same authorization: the caller is
 * either the booking's client, or a member of the organization whose space
 * it books (scoped by `activeOrgId` — a re-verified ACTIVE membership,
 * never an id the caller merely claims). A booking outside both is a 404:
 * knowing a booking id grants nothing on its own.
 */
async function loadAuthorizedBooking({
  bookingId,
  userId,
  activeOrgId,
}: {
  bookingId: string;
  userId: string;
  activeOrgId: string | null;
}) {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      OR: [{ clientUserId: userId }, ...(activeOrgId ? [{ organizationId: activeOrgId }] : [])],
    },
  });
  if (!booking) throw new NotFoundError("Réservation introuvable");
  return booking;
}

/**
 * One conversation per booking, created lazily on first access — a
 * reservation with no exchange yet has no row to speak of, rather than an
 * empty Conversation created the moment the booking itself is.
 */
export async function getOrCreateConversation(params: {
  bookingId: string;
  userId: string;
  activeOrgId: string | null;
}) {
  await loadAuthorizedBooking(params);

  const existing = await prisma.conversation.findUnique({
    where: { bookingId: params.bookingId },
  });
  if (existing) return existing;

  return prisma.conversation.create({ data: { bookingId: params.bookingId } });
}

export async function listMessages(params: {
  bookingId: string;
  userId: string;
  activeOrgId: string | null;
}) {
  await loadAuthorizedBooking(params);

  const conversation = await prisma.conversation.findUnique({
    where: { bookingId: params.bookingId },
  });
  if (!conversation) return [];

  return prisma.message.findMany({
    where: { conversationId: conversation.id },
    include: { sender: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function sendMessage(params: {
  bookingId: string;
  userId: string;
  activeOrgId: string | null;
  body: string;
}) {
  await loadAuthorizedBooking(params);

  const conversation = await getOrCreateConversation(params);
  return prisma.message.create({
    data: { conversationId: conversation.id, senderUserId: params.userId, body: params.body },
    include: { sender: { select: { name: true } } },
  });
}

/**
 * Every booking the caller can message, whichever side they're on — the
 * client of the booking, or a member of the organization that owns its
 * space. Used to list conversations without requiring one to already
 * exist.
 */
export async function listMessageableBookings(params: { userId: string; activeOrgId: string | null }) {
  return prisma.booking.findMany({
    where: {
      status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
      OR: [
        { clientUserId: params.userId },
        ...(params.activeOrgId ? [{ organizationId: params.activeOrgId }] : []),
      ],
    },
    include: {
      space: true,
      clientUser: { select: { name: true } },
      conversation: { include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } },
    },
    orderBy: { createdAt: "desc" },
  });
}
