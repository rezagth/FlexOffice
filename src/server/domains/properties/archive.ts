import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import type { AuthContext } from "@/server/auth/rbac";

/**
 * Archives a property — a status flip, never a hard delete (Étape 16: a
 * property with business data must not be dropped outright). Purely a
 * portfolio-visibility flag in this phase: nothing yet reads
 * `status = ARCHIVED` to block anything, because there is no Listing model
 * yet to gate. Enforcing "an archived property cannot publish" is Phase 5+
 * work, once Listing exists.
 */
export async function archiveProperty(propertyId: string, ctx: AuthContext) {
  const property = await prisma.property.update({
    where: { id: propertyId },
    data: { status: "ARCHIVED" },
  });
  await recordAudit({
    event: "property.archived",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { propertyId },
  });
  return property;
}
