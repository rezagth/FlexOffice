import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { assertOrganizationCanPublish } from "./publication-guard";

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

  // Organization.status existed and was read by no business rule at all, so
  // a suspended partner's listing could still be approved and go live — and,
  // now that the tunnel works, be booked and paid for. Checked only on the
  // way to PUBLISHED: rejecting a suspended organization's space must stay
  // possible, and is in fact the useful thing to be able to do.
  if (status === "PUBLISHED") {
    await assertOrganizationCanPublish(space.organizationId);
  }

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
