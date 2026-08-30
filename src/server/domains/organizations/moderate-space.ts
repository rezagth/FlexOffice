import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";

/**
 * Admin moderation of a submitted listing. Without this step a submitted
 * space would sit in PENDING_REVIEW forever and never reach the public
 * search — the partner publication flow is only complete because this
 * exists. Not scoped by organization: ADMIN is cross-tenant by design,
 * and the calling route enforces requireRole("ADMIN").
 */
export async function publishSpace(actorUserId: string, spaceId: string) {
  return transition(actorUserId, spaceId, "PUBLISHED", "space.published");
}

export async function rejectSpace(actorUserId: string, spaceId: string) {
  return transition(actorUserId, spaceId, "REJECTED", "space.rejected");
}

async function transition(
  actorUserId: string,
  spaceId: string,
  status: "PUBLISHED" | "REJECTED",
  event: string
) {
  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!space) throw new NotFoundError("Space not found");

  const updated = await prisma.space.updateMany({
    where: { id: spaceId, status: "PENDING_REVIEW" },
    data: { status },
  });
  if (updated.count === 0) {
    throw new ConflictError("This space is not awaiting review");
  }

  await recordAudit({
    event,
    actorUserId,
    organizationId: space.organizationId,
    metadata: { spaceId },
  });
}
