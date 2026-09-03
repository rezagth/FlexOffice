import { prisma } from "@/server/db/prisma";
import { ConflictError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import type { AuthContext } from "@/server/auth/rbac";
import type { Prisma } from "@/generated/prisma/client";

export type ManagerHolder = { profileId: string } | { organizationId: string };

function holderData(holder: ManagerHolder) {
  return "profileId" in holder
    ? { profileId: holder.profileId, organizationId: null }
    : { profileId: null, organizationId: holder.organizationId };
}

/**
 * Adds a manager. A manager never becomes an owner or an operator, and this
 * phase grants nothing from `scope` beyond recording it — no per-property
 * RBAC yet (Étape 7: "Ne construis pas encore le RBAC complet par
 * propriété"). In particular a manager is never treated as a CURRENT
 * owner/operator by `isCurrentOwnerOrOperator()`, so adding one never grants
 * access to revenue-shaped data.
 */
export async function addPropertyManager(
  propertyId: string,
  ctx: AuthContext,
  holder: ManagerHolder,
  scope?: Record<string, unknown>
) {
  const manager = await prisma.propertyManager.create({
    data: {
      propertyId,
      scope: (scope as Prisma.InputJsonValue) ?? undefined,
      ...holderData(holder),
    },
  });

  await recordAudit({
    event: "property.manager_added",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { propertyId, managerId: manager.id, ...holderData(holder) },
  });
  return manager;
}

/** Ends a manager's mandate — soft: sets `endsAt`, never deletes the
 * historical row. */
export async function endPropertyManager(propertyId: string, managerId: string, ctx: AuthContext) {
  const result = await prisma.propertyManager.updateMany({
    where: { id: managerId, propertyId, endsAt: null },
    data: { endsAt: new Date() },
  });
  if (result.count === 0) {
    throw new ConflictError("Ce gestionnaire n'est plus actif sur ce bien");
  }

  await recordAudit({
    event: "property.manager_removed",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { propertyId, managerId },
  });
}
