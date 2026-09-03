import { prisma } from "@/server/db/prisma";
import { ConflictError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import type { AuthContext } from "@/server/auth/rbac";

export type OwnerHolder = { profileId: string } | { organizationId: string };

function holderData(holder: OwnerHolder) {
  return "profileId" in holder
    ? { profileId: holder.profileId, organizationId: null }
    : { profileId: null, organizationId: holder.organizationId };
}

/**
 * Adds an owner. The sum of ACTIVE owners' shares must never exceed 10000
 * basis points (100%) — a cross-row invariant a CHECK cannot see (it may
 * only reference the row being written), so it is re-read inside the same
 * transaction as the insert, the same documented trade-off as the
 * capacity/refund invariants in
 * 20260903110100_business_integrity_constraints. See
 * tests/integration/properties.test.ts for the regression test.
 */
export async function addPropertyOwner(
  propertyId: string,
  ctx: AuthContext,
  holder: OwnerHolder,
  ownershipShareBasisPoints: number
) {
  const owner = await prisma.$transaction(async (tx) => {
    const activeOwners = await tx.propertyOwner.findMany({
      where: { propertyId, endsAt: null },
      select: { ownershipShareBasisPoints: true },
    });
    const currentTotal = activeOwners.reduce((sum, o) => sum + o.ownershipShareBasisPoints, 0);
    if (currentTotal + ownershipShareBasisPoints > 10000) {
      throw new ConflictError(
        `La somme des quotes-parts actives dépasserait 100 % (${currentTotal + ownershipShareBasisPoints} / 10000)`
      );
    }
    return tx.propertyOwner.create({
      data: { propertyId, ownershipShareBasisPoints, ...holderData(holder) },
    });
  });

  await recordAudit({
    event: "property.owner_added",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { propertyId, ownerId: owner.id, ...holderData(holder) },
  });
  return owner;
}

/** Ends an owner's stake — soft: sets `endsAt`, never deletes the historical
 * row. A no-op target (already ended, or belonging to a different property)
 * is a 409, not a silent success. */
export async function endPropertyOwner(propertyId: string, ownerId: string, ctx: AuthContext) {
  const result = await prisma.propertyOwner.updateMany({
    where: { id: ownerId, propertyId, endsAt: null },
    data: { endsAt: new Date() },
  });
  if (result.count === 0) {
    throw new ConflictError("Cet actionnaire n'est plus actif sur ce bien");
  }

  await recordAudit({
    event: "property.owner_removed",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { propertyId, ownerId },
  });
}
