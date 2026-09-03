import type { OrgRole, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { ConflictError } from "@/server/lib/errors";

/**
 * Membership invariants that no database constraint can hold.
 *
 * The composite primary key on `organization_members` already makes a
 * duplicate membership impossible, and the foreign keys already make a
 * membership of a phantom organization impossible. What is left needs to see
 * other rows, which a CHECK cannot:
 *
 *   "an organization always has at least one ACTIVE OWNER"
 *
 * A trigger would work but would fire on every membership write, and
 * multiple OWNERs must stay legal — an agency with two partners is the
 * normal case, so a unique index would be the wrong tool. Enforced here,
 * with a test, and stated in the migration so the choice is on the record.
 */

/** Counts ACTIVE owners, optionally excluding one profile. */
export async function countActiveOwners(
  tx: Prisma.TransactionClient,
  organizationId: string,
  options: { excludeProfileId?: string } = {}
): Promise<number> {
  return tx.organizationMember.count({
    where: {
      organizationId,
      orgRole: "OWNER",
      status: "ACTIVE",
      ...(options.excludeProfileId
        ? { profileId: { not: options.excludeProfileId } }
        : {}),
    },
  });
}

/**
 * Refuses a change that would leave an organization with no ACTIVE owner.
 *
 * Call before demoting, revoking or removing a member. An organization with
 * no owner cannot be administered by anyone — nobody can invite, nobody can
 * publish, and only a platform administrator could ever unblock it. Better to
 * refuse the last step than to create that state.
 */
export async function assertOrganizationKeepsAnOwner(
  tx: Prisma.TransactionClient,
  organizationId: string,
  profileBeingChanged: string
) {
  const remaining = await countActiveOwners(tx, organizationId, {
    excludeProfileId: profileBeingChanged,
  });
  if (remaining === 0) {
    throw new ConflictError(
      "Cette organisation doit conserver au moins un propriétaire actif."
    );
  }
}

/**
 * The single place a landlord authorization reads from.
 *
 * Exposed separately from `findActiveMembership` in active-context.ts because
 * that one answers "what is the current context"; this one answers "does this
 * person hold at least this much authority here", which is what a mutation
 * needs.
 */
export async function hasActiveMembership(
  profileId: string,
  organizationId: string,
  allowedRoles?: readonly OrgRole[]
): Promise<boolean> {
  const membership = await prisma.organizationMember.findFirst({
    where: {
      profileId,
      organizationId,
      status: "ACTIVE",
      ...(allowedRoles ? { orgRole: { in: [...allowedRoles] } } : {}),
    },
    select: { profileId: true },
  });
  return membership !== null;
}
