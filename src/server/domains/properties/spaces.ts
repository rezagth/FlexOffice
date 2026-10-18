import { prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import type { AuthContext } from "@/server/auth/rbac";
import type { Capability } from "@/server/auth/capabilities";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { getPublicPhotoUrl } from "@/server/domains/media/photo-storage";
import type { UpdateSpaceInput } from "@/lib/validation/spaces";
import { applySpaceUpdate } from "@/server/domains/organizations/update-space";

/** Bookings on a space that the landlord is still on the hook to honor —
 * R63: withdrawing a space never cancels these, so a partner should at
 * least see how many there are before (archiveSpace) and after
 * (getUpcomingBookingsForSpace) withdrawing. */
const ONGOING_BOOKING_STATUSES = ["AWAITING_PAYMENT", "PENDING", "CONFIRMED"] as const;

export async function countUpcomingBookings(spaceId: string): Promise<number> {
  return prisma.booking.count({
    where: { spaceId, status: { in: [...ONGOING_BOOKING_STATUSES] }, startsAt: { gt: new Date() } },
  });
}

/** For the archived-space read-only view: what the partner is still
 * committed to. */
export async function getUpcomingBookingsForSpace(spaceId: string) {
  return prisma.booking.findMany({
    where: { spaceId, status: { in: [...ONGOING_BOOKING_STATUSES] }, startsAt: { gt: new Date() } },
    include: { clientUser: { select: { name: true, email: true } } },
    orderBy: { startsAt: "asc" },
  });
}

/**
 * Resolves a space by id and authorizes the caller through its PROPERTY —
 * not through `Space.organizationId` (see the doc comment on that column
 * in prisma/schema.prisma: new work in Phase 5 derives access from
 * Property rather than adding another organizationId-based check). Used by
 * every `/api/spaces/[id]/...` route.
 */
export async function requireSpaceManageAccess(
  spaceId: string,
  capability: Capability = "landlord:manage_spaces"
) {
  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!space) throw new NotFoundError("Space not found");
  const { ctx } = await requirePropertyManageAccess(space.propertyId, capability);
  return { ctx, space };
}

/** Spaces of one property, for the property detail page. */
export async function listSpacesForProperty(propertyId: string) {
  return prisma.space.findMany({ where: { propertyId }, orderBy: { createdAt: "desc" } });
}

/** One space, scoped to the property it must belong to — a space id from
 * one property's page can never resolve a space that actually lives under
 * another. */
export async function getSpaceForProperty(propertyId: string, spaceId: string) {
  const space = await prisma.space.findFirst({
    where: { id: spaceId, propertyId },
    include: {
      openingHours: { orderBy: { opensAt: "asc" } },
      closures: { orderBy: { startsAt: "asc" } },
      spacePhotos: { orderBy: { position: "asc" } },
    },
  });
  if (!space) throw new NotFoundError("Space not found");
  return {
    ...space,
    spacePhotos: space.spacePhotos.map((p) => ({ ...p, url: getPublicPhotoUrl(p.storagePath) })),
  };
}

/** Edits a space the caller already reached through `requireSpaceManageAccess()`.
 * Authorization stays Property-derived here (not `updateSpace()`, which
 * re-derives ownership from `organizationId`); the write itself goes
 * through the shared `applySpaceUpdate()`. */
export async function updateSpaceViaProperty(spaceId: string, ctx: AuthContext, input: UpdateSpaceInput) {
  const existing = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!existing) throw new NotFoundError("Space not found");
  // Same pricing and re-moderation rules as the organization-scoped path.
  return applySpaceUpdate(existing, input, { actorUserId: ctx.userId, organizationId: ctx.activeOrgId });
}

/**
 * Archives a space — a status flip (Étape 25: ACTIVE/ARCHIVED only, no new
 * publication-shaped state added here; `SpaceStatus` already carries the
 * Phase 1 publication states and this phase does not touch them). Reuses
 * the existing `ARCHIVED` value of `SpaceStatus` rather than adding a
 * second status axis.
 *
 * R63 — space withdrawal rule: removes the space from the catalogue
 * immediately (ARCHIVED already blocks new bookings, same PUBLISHED-only
 * gate as any other non-published status — createBooking.ts). Existing
 * bookings are never touched here: the landlord remains committed to
 * honoring them, same as moderate-space.ts's unpublishSpace() and
 * suspension.ts's suspendOrganization() both already do, by explicit
 * design. A landlord who wants to also cancel an upcoming booking does so
 * through the existing, separate landlord-cancellation flow
 * (bookings/cancel.ts), which already refunds the client in full and
 * charges the landlord the commission if inside the cancellation window.
 *
 * Admin-forced withdrawal (with a mandatory reason and its own audit
 * trail) is a distinct, not-yet-built feature — out of scope here.
 */
export async function archiveSpace(spaceId: string, ctx: AuthContext) {
  const upcomingBookings = await countUpcomingBookings(spaceId);

  const updated = await prisma.space.updateMany({
    where: { id: spaceId, status: { not: "ARCHIVED" } },
    data: { status: "ARCHIVED" },
  });
  if (updated.count === 0) {
    throw new ConflictError("Cet espace est déjà archivé.");
  }
  const space = await prisma.space.findUniqueOrThrow({ where: { id: spaceId } });

  await recordAudit({
    event: "space.archived",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { spaceId, propertyId: space.propertyId, upcomingBookings },
  });
  return { space, upcomingBookings };
}
