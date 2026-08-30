import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";

/** Partner submits a DRAFT (or previously REJECTED) space for admin
 * review. Conditional update so a double submit is a 409, not a silent
 * second transition. */
export async function submitSpaceForReview(organizationId: string, spaceId: string) {
  const space = await prisma.space.findFirst({ where: { id: spaceId, organizationId } });
  if (!space) throw new NotFoundError("Space not found");

  const updated = await prisma.space.updateMany({
    where: { id: spaceId, organizationId, status: { in: ["DRAFT", "REJECTED"] } },
    data: { status: "PENDING_REVIEW" },
  });
  if (updated.count === 0) {
    throw new ConflictError("This space cannot be submitted in its current state");
  }

  await recordAudit({ event: "space.submitted", organizationId, metadata: { spaceId } });
}
