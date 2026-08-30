import { prisma } from "@/server/db/prisma";
import { NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import type { ClosureInput } from "@/lib/validation/spaces";

/** Blocks a date range on a space the calling organization owns (holiday,
 * internal use, maintenance). A closure only affects availability — it
 * does not cancel bookings already confirmed in that range. */
export async function createClosure(organizationId: string, spaceId: string, input: ClosureInput) {
  const space = await prisma.space.findFirst({ where: { id: spaceId, organizationId } });
  if (!space) throw new NotFoundError("Space not found");

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
