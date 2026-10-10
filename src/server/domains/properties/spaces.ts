import { prisma } from "@/server/db/prisma";
import { NotFoundError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import type { AuthContext } from "@/server/auth/rbac";
import type { Capability } from "@/server/auth/capabilities";
import { requirePropertyManageAccess } from "@/server/domains/properties/access";
import { getPublicPhotoUrl } from "@/server/domains/media/photo-storage";
import type { UpdateSpaceInput } from "@/lib/validation/spaces";
import { applySpaceUpdate } from "@/server/domains/organizations/update-space";

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
 */
export async function archiveSpace(spaceId: string, ctx: AuthContext) {
  const space = await prisma.space.update({
    where: { id: spaceId },
    data: { status: "ARCHIVED" },
  });

  await recordAudit({
    event: "space.archived",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { spaceId, propertyId: space.propertyId },
  });
  return space;
}
