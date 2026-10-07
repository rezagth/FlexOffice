import type { SpaceStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import { notifySpaceModeration } from "@/server/domains/notifications/send-notifications";
import { assertOrganizationCanPublish } from "./publication-guard";

/**
 * Admin moderation of listings. Not scoped by organization: ADMIN is
 * cross-tenant by design, and the calling routes enforce the admin
 * capability. Each decision is audited and e-mailed to the landlord
 * (best-effort).
 */
export async function publishSpace(actorUserId: string, spaceId: string) {
  await transition({ actorUserId, spaceId, from: "PENDING_REVIEW", to: "PUBLISHED", event: "space.published" });
  await notifySpaceModeration(spaceId, { kind: "PUBLISHED" });
}

export async function rejectSpace(actorUserId: string, spaceId: string, reason?: string | null) {
  await transition({
    actorUserId,
    spaceId,
    from: "PENDING_REVIEW",
    to: "REJECTED",
    event: "space.rejected",
    reason: reason ?? null,
  });
  await notifySpaceModeration(spaceId, { kind: "REJECTED", reason: reason ?? null });
}

/**
 * Takes a PUBLISHED listing off the catalogue (content reported, listing no
 * longer accurate…). It lands in REJECTED — the state the landlord already
 * knows how to leave: edit, then submit again for review. Bookings already
 * made are not cancelled; that stays a separate, explicit decision.
 */
export async function unpublishSpace(actorUserId: string, spaceId: string, reason: string) {
  await transition({ actorUserId, spaceId, from: "PUBLISHED", to: "REJECTED", event: "space.unpublished", reason });
  await notifySpaceModeration(spaceId, { kind: "UNPUBLISHED", reason });
}

async function transition(params: {
  actorUserId: string;
  spaceId: string;
  from: SpaceStatus;
  to: SpaceStatus;
  event: string;
  reason?: string | null;
}) {
  const space = await prisma.space.findUnique({ where: { id: params.spaceId } });
  if (!space) throw new NotFoundError("Space not found");

  // A suspended (or not yet verified) organization's listing never goes
  // live. Checked only on the way to PUBLISHED: rejecting or unpublishing a
  // suspended organization's space must stay possible.
  if (params.to === "PUBLISHED") {
    await assertOrganizationCanPublish(space.organizationId);
  }

  const updated = await prisma.space.updateMany({
    where: { id: params.spaceId, status: params.from },
    data: { status: params.to },
  });
  if (updated.count === 0) {
    throw new ConflictError(
      params.from === "PUBLISHED" ? "Cette annonce n'est pas publiée." : "Cette annonce n'est pas en attente de validation."
    );
  }

  await recordAudit({
    event: params.event,
    actorUserId: params.actorUserId,
    organizationId: space.organizationId,
    metadata: { spaceId: params.spaceId, ...(params.reason ? { reason: params.reason } : {}) },
  });
}
