import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/lib/errors";
import { ADMIN_PAGE_SIZE, paginationOffsets } from "@/lib/pagination";
import { createInAppNotification } from "@/server/domains/notifications/in-app";
import { isDuplicateVerifiedPhone } from "@/server/domains/users/phone-verification";

/**
 * Back-office user management (FCT-16). Every function is called from a
 * route or page that already enforced the admin capability; the actor id
 * always comes from that verified session.
 */

/** What the back office shows of an account — no auth secrets, nothing
 * beyond what the list needs. */
const USER_LIST_SELECT = {
  id: true,
  email: true,
  name: true,
  platformRole: true,
  isLandlord: true,
  createdAt: true,
  deletedAt: true,
  suspendedAt: true,
} satisfies Prisma.ProfileSelect;

export async function listUsers({ query, page }: { query?: string; page: number }) {
  const q = query?.trim();
  const where: Prisma.ProfileWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const [users, totalCount] = await Promise.all([
    prisma.profile.findMany({
      where,
      select: USER_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      ...paginationOffsets(page, ADMIN_PAGE_SIZE),
    }),
    prisma.profile.count({ where }),
  ]);
  return { users, totalCount };
}

/**
 * Suspends an account: from the next request on, getAuthContext() resolves
 * no session for it (see rbac.ts) — every page and route treats it as
 * signed out. Data, bookings and memberships are kept untouched; this is
 * reversible, unlike a GDPR deletion.
 *
 * An administrator can never suspend themselves (it would also be the
 * quickest way to lock the last admin out of the back office).
 */
export async function suspendUser(actorUserId: string, targetUserId: string, reason: string) {
  if (actorUserId === targetUserId) {
    throw new ForbiddenError("Vous ne pouvez pas suspendre votre propre compte.");
  }
  const target = await prisma.profile.findUnique({ where: { id: targetUserId } });
  if (!target) throw new NotFoundError("Utilisateur introuvable");
  if (target.deletedAt) throw new ConflictError("Ce compte a été supprimé.");

  const updated = await prisma.profile.updateMany({
    where: { id: targetUserId, suspendedAt: null, deletedAt: null },
    data: { suspendedAt: new Date() },
  });
  // Already suspended: nothing to do, and nothing new to audit.
  if (updated.count === 0) return { suspended: true, changed: false };

  await recordAudit({
    event: "user.suspended",
    actorUserId,
    metadata: { targetUserId, reason },
  });
  return { suspended: true, changed: true };
}

export async function reactivateUser(actorUserId: string, targetUserId: string) {
  const target = await prisma.profile.findUnique({ where: { id: targetUserId } });
  if (!target) throw new NotFoundError("Utilisateur introuvable");

  const updated = await prisma.profile.updateMany({
    where: { id: targetUserId, suspendedAt: { not: null } },
    data: { suspendedAt: null },
  });
  if (updated.count === 0) return { suspended: false, changed: false };

  await recordAudit({
    event: "user.reactivated",
    actorUserId,
    metadata: { targetUserId },
  });
  return { suspended: false, changed: true };
}

/**
 * PRD V1.1, 2B — the support-assisted path for a phone number change when
 * the OLD (currently verified) number is unreachable: no self-service exists
 * for this (phone-verification.ts's NUMBER_CHANGE flow requires proving you
 * still control the old number), so an admin sets the new one directly after
 * verifying identity out of band. `reason` is mandatory and kept in the
 * audit log — the actual number is too, deliberately: unlike an in-app
 * notification (never the full number, R69), an admin-only audit trail
 * needs it for support traceability.
 */
export async function adminSetVerifiedPhone(
  actorUserId: string,
  targetUserId: string,
  newPhone: string,
  reason: string
) {
  const target = await prisma.profile.findUnique({ where: { id: targetUserId } });
  if (!target) throw new NotFoundError("Utilisateur introuvable");
  if (target.deletedAt) throw new ConflictError("Ce compte a été supprimé.");

  try {
    await prisma.profile.update({
      where: { id: targetUserId },
      data: { phone: newPhone, phoneVerifiedAt: new Date() },
    });
  } catch (error) {
    if (isDuplicateVerifiedPhone(error)) {
      throw new ConflictError("Ce numéro est déjà utilisé et vérifié par un autre compte.");
    }
    throw error;
  }

  await recordAudit({
    event: "admin.phone_set",
    actorUserId,
    metadata: { targetUserId, newPhone, reason },
  });
  await createInAppNotification({
    recipientProfileId: targetUserId,
    type: "PHONE_VERIFIED",
    title: "Numéro de téléphone mis à jour",
    body: "Votre numéro de téléphone a été mis à jour par le support, à votre demande.",
  });

  return { updated: true };
}
