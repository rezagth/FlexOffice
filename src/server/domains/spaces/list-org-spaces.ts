import { prisma } from "@/server/db/prisma";

/** Spaces belonging to one organization — always scoped by organizationId,
 * never a bare findMany(), so a PARTNER can only ever see their own. */
export async function listOrgSpaces(organizationId: string) {
  return prisma.space.findMany({
    where: { organizationId },
    include: { property: { select: { id: true, label: true } } },
    orderBy: { createdAt: "desc" },
  });
}
