import { prisma } from "@/server/db/prisma";
import { NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import type { UpdateSpaceInput } from "@/lib/validation/spaces";

/** Edits a space owned by the calling partner's organization. Scoped by
 * organizationId on the read that establishes ownership before any write
 * — organizationId itself is never client-writable, so there is no race
 * to worry about between the check and the update that follows it. */
export async function updateSpace(organizationId: string, spaceId: string, input: UpdateSpaceInput) {
  const existing = await prisma.space.findFirst({ where: { id: spaceId, organizationId } });
  if (!existing) throw new NotFoundError("Space not found");

  const space = await prisma.space.update({
    where: { id: spaceId },
    data: { ...input },
  });
  await recordAudit({ event: "space.updated", organizationId, metadata: { spaceId } });
  return space;
}
