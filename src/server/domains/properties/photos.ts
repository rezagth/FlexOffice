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
 * Adds a photo to a property. The caller has already passed
 * `requirePropertyManageAccess()` — this only does the parts that are
 * about the file itself: real content-type sniffing (never trusting the
 * browser's claimed `file.type` alone — see photo-storage.ts), size, and
 * count. The first photo on a property becomes its primary automatically;
 * nothing else does, since more than one PRIMARY is a DB-level conflict
 * (`property_photos_one_primary_idx`).
 */
export async function addPropertyPhoto(propertyId: string, ctx: AuthContext, file: File) {
  const count = await prisma.propertyPhoto.count({ where: { propertyId } });
  if (count >= MAX_PHOTOS_PER_ENTITY) {
    throw new ValidationError(`Maximum ${MAX_PHOTOS_PER_ENTITY} photos par bien.`);
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
  const path = buildPhotoStoragePath("properties", propertyId, photoId, sniffed.extension);
  await uploadPhotoObject(path, bytes.buffer as ArrayBuffer, sniffed.mimeType);

  const photo = await prisma.propertyPhoto.create({
    data: {
      id: photoId,
      propertyId,
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
    metadata: { propertyId, photoId: photo.id, scope: "property" },
  });

  return { ...photo, url: getPublicPhotoUrl(photo.storagePath) };
}

export async function listPropertyPhotos(propertyId: string) {
  const photos = await prisma.propertyPhoto.findMany({
    where: { propertyId },
    orderBy: { position: "asc" },
  });
  return photos.map((p) => ({ ...p, url: getPublicPhotoUrl(p.storagePath) }));
}

export async function removePropertyPhoto(propertyId: string, photoId: string, ctx: AuthContext) {
  const photo = await prisma.propertyPhoto.findFirst({ where: { id: photoId, propertyId } });
  if (!photo) throw new NotFoundError("Photo not found");

  await prisma.propertyPhoto.delete({ where: { id: photoId } });
  await deletePhotoObject(photo.storagePath);

  // A primary photo just vanished — hand the role to whatever is now
  // first, so the property is never left with zero primary photos while
  // it still has some.
  if (photo.isPrimary) {
    const next = await prisma.propertyPhoto.findFirst({
      where: { propertyId },
      orderBy: { position: "asc" },
    });
    if (next) await prisma.propertyPhoto.update({ where: { id: next.id }, data: { isPrimary: true } });
  }

  await recordAudit({
    event: "photo.deleted",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { propertyId, photoId, scope: "property" },
  });
}

export async function setPrimaryPropertyPhoto(propertyId: string, photoId: string, ctx: AuthContext) {
  const photo = await prisma.propertyPhoto.findFirst({ where: { id: photoId, propertyId } });
  if (!photo) throw new NotFoundError("Photo not found");

  await prisma.$transaction([
    prisma.propertyPhoto.updateMany({ where: { propertyId }, data: { isPrimary: false } }),
    prisma.propertyPhoto.update({ where: { id: photoId }, data: { isPrimary: true } }),
  ]);

  await recordAudit({
    event: "photo.reordered",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { propertyId, photoId, action: "set_primary", scope: "property" },
  });
}

/** Reorders every photo of the property to match `orderedIds` — the full
 * set, not a partial move, the same "replace the whole thing" shape as
 * `replaceOpeningHours()`. Every id must belong to this property or the
 * whole call is refused, so a caller cannot smuggle in another property's
 * photo id to learn whether it exists. */
export async function reorderPropertyPhotos(propertyId: string, orderedIds: string[], ctx: AuthContext) {
  const existing = await prisma.propertyPhoto.findMany({ where: { propertyId }, select: { id: true } });
  const existingIds = new Set(existing.map((p) => p.id));
  if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
    throw new ValidationError("La liste doit contenir exactement les photos de ce bien.");
  }

  await prisma.$transaction(
    orderedIds.map((id, position) => prisma.propertyPhoto.update({ where: { id }, data: { position } }))
  );

  await recordAudit({
    event: "photo.reordered",
    actorUserId: ctx.userId,
    organizationId: ctx.activeOrgId,
    metadata: { propertyId, action: "reorder", scope: "property" },
  });
}
