import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { formatDateTime } from "@/lib/format";
import type { ClosureInput } from "@/lib/validation/spaces";

/** Bookings a closure may not silently overlap: confirmed ones (the client
 * is coming) and requests awaiting the landlord's answer (accepting one
 * later would book a closed space). */
const BLOCKING_STATUSES = ["CONFIRMED", "PENDING"] as const;

/** Blocks a date range on a space the calling organization owns (holiday,
 * internal use, maintenance).
 *
 * FCT-25 — a closure used to be created over confirmed bookings without a
 * word: the client still came to a closed space. It is now refused (409)
 * while such bookings exist, listing them; the landlord cancels them (the
 * client is refunded and notified by that flow) or refuses the pending
 * requests first. Not a database constraint: a booking created in the same
 * instant is still possible, the closure check at booking time covers the
 * other direction. */
export async function createClosure(organizationId: string, spaceId: string, input: ClosureInput) {
  const space = await prisma.space.findFirst({ where: { id: spaceId, organizationId } });
  if (!space) throw new NotFoundError("Space not found");

  const overlapping = await prisma.booking.findMany({
    where: {
      spaceId,
      status: { in: [...BLOCKING_STATUSES] },
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
    include: { clientUser: { select: { name: true } } },
    orderBy: { startsAt: "asc" },
  });
  if (overlapping.length > 0) {
    const list = overlapping
      .map(
        (b) =>
          `${formatDateTime(b.startsAt)} – ${formatDateTime(b.endsAt)} (${b.clientUser.name}, ${
            b.status === "CONFIRMED" ? "confirmée" : "demande en attente"
          })`
      )
      .join(" ; ");
    throw new ConflictError(
      `Cette fermeture chevauche ${overlapping.length} réservation${overlapping.length > 1 ? "s" : ""} : ${list}. ` +
        "Annulez les réservations confirmées et refusez les demandes en attente avant de créer la fermeture."
    );
  }

  const closure = await prisma.spaceClosure.create({
    data: { spaceId, startsAt: input.startsAt, endsAt: input.endsAt, reason: input.reason },
  });
  await recordAudit({
    event: "space.closure_created",
    organizationId,
    metadata: { spaceId, closureId: closure.id },
  });
  return closure;
}

export async function deleteClosure(organizationId: string, spaceId: string, closureId: string) {
  const deleted = await prisma.spaceClosure.deleteMany({
    where: { id: closureId, spaceId, space: { organizationId } },
  });
  if (deleted.count === 0) throw new NotFoundError("Closure not found");
  await recordAudit({
    event: "space.closure_deleted",
    organizationId,
    metadata: { spaceId, closureId },
  });
}

export async function listClosures(organizationId: string, spaceId: string) {
  const space = await prisma.space.findFirst({ where: { id: spaceId, organizationId } });
  if (!space) throw new NotFoundError("Space not found");
  return prisma.spaceClosure.findMany({ where: { spaceId }, orderBy: { startsAt: "asc" } });
}
