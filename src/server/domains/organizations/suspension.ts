import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { NotFoundError } from "@/server/lib/errors";
import { notifyOrganizationStatus } from "@/server/domains/notifications/send-notifications";

/**
 * Back-office suspension of a landlord organization (FCT-16).
 *
 * SUSPENDED is already enforced everywhere it matters by
 * publication-guard.ts: the organization's listings leave every public
 * surface and none can be (re)published. Bookings already confirmed are not
 * cancelled — that would refund and notify clients, a separate decision.
 *
 * Reactivation restores VERIFIED only when an APPROVED verification dossier
 * backs it — the same rule as review.ts, which is the only other place the
 * status becomes VERIFIED. Otherwise the organization goes back to
 * PENDING_VERIFICATION.
 */
export async function suspendOrganization(actorUserId: string, organizationId: string, reason: string) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) throw new NotFoundError("Organisation introuvable");

  const updated = await prisma.organization.updateMany({
    where: { id: organizationId, status: { not: "SUSPENDED" } },
    data: { status: "SUSPENDED" },
  });
  if (updated.count === 0) return { status: "SUSPENDED" as const, changed: false };

  await recordAudit({
    event: "organization.suspended",
    actorUserId,
    organizationId,
    metadata: { previousStatus: organization.status, reason },
  });
  await notifyOrganizationStatus(organizationId, { kind: "SUSPENDED", reason });
  return { status: "SUSPENDED" as const, changed: true };
}

export async function reactivateOrganization(actorUserId: string, organizationId: string) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) throw new NotFoundError("Organisation introuvable");
  if (organization.status !== "SUSPENDED") return { status: organization.status, changed: false };

  const approved = await prisma.landlordVerification.findFirst({
    where: { organizationId, status: "APPROVED" },
    select: { id: true },
  });
  const status = approved ? ("VERIFIED" as const) : ("PENDING_VERIFICATION" as const);

  const updated = await prisma.organization.updateMany({
    where: { id: organizationId, status: "SUSPENDED" },
    data: { status },
  });
  if (updated.count === 0) {
    const current = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    return { status: current.status, changed: false };
  }

  await recordAudit({
    event: "organization.reactivated",
    actorUserId,
    organizationId,
    metadata: { status },
  });
  await notifyOrganizationStatus(organizationId, { kind: "REACTIVATED" });
  return { status, changed: true };
}
