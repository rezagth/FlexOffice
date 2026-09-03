import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, NotFoundError } from "@/server/lib/errors";

const OPEN_STATUSES = ["OPEN", "INVESTIGATING"] as const;

/**
 * Raises a dispute on a booking. Either side may signal one: the client who
 * made it, or the landlord organization whose space it books — scoped by
 * `activeOrgId` (a re-verified ACTIVE membership), never by an id the
 * caller merely claims. A booking outside both is a 404, not a 403: it
 * neither confirms nor denies the booking's existence to a caller with no
 * standing on it.
 */
export async function raiseDispute({
  bookingId,
  actorUserId,
  activeOrgId,
  description,
}: {
  bookingId: string;
  actorUserId: string;
  activeOrgId: string | null;
  description: string;
}) {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      OR: [
        { clientUserId: actorUserId },
        ...(activeOrgId ? [{ organizationId: activeOrgId }] : []),
      ],
    },
  });
  if (!booking) throw new NotFoundError("Réservation introuvable");

  const existingOpen = await prisma.dispute.findFirst({
    where: { bookingId, status: { in: [...OPEN_STATUSES] } },
  });
  if (existingOpen) {
    throw new ConflictError("Un litige est déjà en cours pour cette réservation.");
  }

  const dispute = await prisma.$transaction(async (tx) => {
    const created = await tx.dispute.create({
      data: {
        bookingId,
        raisedByUserId: actorUserId,
        description,
        status: "OPEN",
      },
    });
    await tx.disputeEvent.create({
      data: { disputeId: created.id, status: "OPEN", note: description },
    });
    return created;
  });

  await recordAudit({
    event: "dispute.raised",
    actorUserId,
    organizationId: booking.organizationId,
    metadata: { disputeId: dispute.id, bookingId },
  });

  return dispute;
}
