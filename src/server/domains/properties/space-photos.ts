import { prisma } from "@/server/db/prisma";
import { NotFoundError, ValidationError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";
import type { AuthContext } from "@/server/auth/rbac";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_ENTITY,
  buildPhotoStoragePath,
  deletePhotoObject,
  getPublicPhotoUrl,
  sniffFileType,
  uploadPhotoObject,
} from "@/server/domains/media/photo-storage";

const CLAIMED_TYPE_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Space-photo CRUD, the `SpacePhoto` counterpart of `properties/photos.ts`
 * — same validation, same primary-photo bookkeeping. Deliberately
 * authorized via the space's PROPERTY (the caller already resolved
 * `requirePropertyManageAccess(space.propertyId)`), not via
 * `Space.organizationId` — new work in this phase derives access from
 * Property rather than adding another organizationId-based check (Étape 29:
 * reduce, don't deepen, that dependency).
 */
export async function addSpacePhoto(spaceId: string, ctx: AuthContext, file: File) {
  const count = await prisma.spacePhoto.count({ where: { spaceId } });
  if (count >= MAX_PHOTOS_PER_ENTITY) {
    throw new ValidationError(`Maximum ${MAX_PHOTOS_PER_ENTITY} photos par espace.`);
  }
  if (file.size === 0) throw new ValidationError("Le fichier est vide.");
  if (file.size > MAX_PHOTO_BYTES) throw new ValidationError("La photo ne doit pas dépasser 5 Mo.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffFileType(bytes);
  const claimedExtension = CLAIMED_TYPE_EXTENSION[file.type];
  if (!sniffed || !claimedExtension || sniffed.mimeType !== file.type) {
    throw new ValidationError("Format accepté : JPEG, PNG ou WebP.");
  }

  const photoId = crypto.randomUUID();
  const path = buildPhotoStoragePath("spaces", spaceId, photoId, sniffed.extension);
  await uploadPhotoObject(path, bytes.buffer as ArrayBuffer, sniffed.mimeType);

  const photo = await prisma.spacePhoto.create({
    data: {
      id: photoId,
      spaceId,
      storagePath: path,
      mimeType: sniffed.mimeType,
      sizeBytes: file.size,
      position: count,
      isPrimary: count === 0,
    },
  });

  await recordAudit({
    event: "photo.uploaded",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { spaceId, photoId: photo.id, scope: "space" },
  });

  return { ...photo, url: getPublicPhotoUrl(photo.storagePath) };
}

export async function listSpacePhotos(spaceId: string) {
  const photos = await prisma.spacePhoto.findMany({ where: { spaceId }, orderBy: { position: "asc" } });
  return photos.map((p) => ({ ...p, url: getPublicPhotoUrl(p.storagePath) }));
}

export async function removeSpacePhoto(spaceId: string, photoId: string, ctx: AuthContext) {
  const photo = await prisma.spacePhoto.findFirst({ where: { id: photoId, spaceId } });
  if (!photo) throw new NotFoundError("Photo not found");

  await prisma.spacePhoto.delete({ where: { id: photoId } });
  await deletePhotoObject(photo.storagePath);

  if (photo.isPrimary) {
    const next = await prisma.spacePhoto.findFirst({ where: { spaceId }, orderBy: { position: "asc" } });
    if (next) await prisma.spacePhoto.update({ where: { id: next.id }, data: { isPrimary: true } });
  }

  await recordAudit({
    event: "photo.deleted",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { spaceId, photoId, scope: "space" },
  });
}

export async function setPrimarySpacePhoto(spaceId: string, photoId: string, ctx: AuthContext) {
  const photo = await prisma.spacePhoto.findFirst({ where: { id: photoId, spaceId } });
  if (!photo) throw new NotFoundError("Photo not found");

  await prisma.$transaction([
    prisma.spacePhoto.updateMany({ where: { spaceId }, data: { isPrimary: false } }),
    prisma.spacePhoto.update({ where: { id: photoId }, data: { isPrimary: true } }),
  ]);

  await recordAudit({
    event: "photo.reordered",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { spaceId, photoId, action: "set_primary", scope: "space" },
  });
}

export async function reorderSpacePhotos(spaceId: string, orderedIds: string[], ctx: AuthContext) {
  const existing = await prisma.spacePhoto.findMany({ where: { spaceId }, select: { id: true } });
  const existingIds = new Set(existing.map((p) => p.id));
  if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
    throw new ValidationError("La liste doit contenir exactement les photos de cet espace.");
  }

  await prisma.$transaction(
    orderedIds.map((id, position) => prisma.spacePhoto.update({ where: { id }, data: { position } }))
  );

  await recordAudit({
    event: "photo.reordered",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { spaceId, action: "reorder", scope: "space" },
  });
}
