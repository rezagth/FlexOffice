import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import type { AuthContext } from "@/server/auth/rbac";
import type { UpdatePropertyInput } from "@/lib/validation/properties";

/**
 * Edits a property. The caller has already passed
 * `requirePropertyManageAccess()` — this function trusts that the ownership
 * check happened, the same split as `update-space.ts` (check, then write).
 *
 * No field-level permission tiers yet (Étape 15's OWNER/OPERATOR/MANAGER
 * distinction is not enforced beyond "related to this property at all" —
 * see the doc comment on `requirePropertyManageAccess`); tracked as
 * technical debt in the Phase 4 report.
 */
export async function updateProperty(
  propertyId: string,
  ctx: AuthContext,
  input: UpdatePropertyInput
) {
  const property = await prisma.property.update({
    where: { id: propertyId },
    data: { ...input },
  });
  await recordAudit({
    event: "property.updated",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { propertyId },
  });
  return property;
}
