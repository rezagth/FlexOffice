import { prisma } from "@/server/db/prisma";
import { createSupabaseAdminClient } from "@/server/auth/supabase-admin";
import { NotFoundError, ValidationError } from "@/server/lib/errors";
import { recordAudit } from "@/server/lib/audit";

export const PHOTO_BUCKET = "space-photos";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS_PER_SPACE = 10;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Photos are uploaded through this server route rather than straight from
 * the browser to Storage. It costs one hop, and buys the checks that
 * matter: the caller owns the space, the file really is an image of a
 * sane size, and the object path is derived server-side so a caller can
 * never write outside its own organization's prefix.
 *
 * The bucket is public-read (a published listing's photos are public by
 * definition); everything that writes goes through here.
 */
export async function addSpacePhoto(
  organizationId: string,
  spaceId: string,
  file: File
): Promise<{ url: string; photos: string[] }> {
  const space = await prisma.space.findFirst({ where: { id: spaceId, organizationId } });
  if (!space) throw new NotFoundError("Space not found");

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    throw new ValidationError("Format accepté : JPEG, PNG ou WebP.");
  }
  if (file.size === 0) {
    throw new ValidationError("Le fichier est vide.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new ValidationError("La photo ne doit pas dépasser 5 Mo.");
  }
  if (space.photos.length >= MAX_PHOTOS_PER_SPACE) {
    throw new ValidationError(`Maximum ${MAX_PHOTOS_PER_SPACE} photos par espace.`);
  }

  // Path is built here, never from the client: the organization prefix is
  // what keeps one partner's uploads out of another's folder.
  const objectPath = `${organizationId}/${spaceId}/${crypto.randomUUID()}.${extension}`;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(objectPath, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    });
  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(objectPath);

  const updated = await prisma.space.update({
    where: { id: spaceId },
    data: { photos: { push: publicUrl } },
  });

  await recordAudit({
    event: "space.photo_added",
    organizationId,
    metadata: { spaceId, objectPath },
  });

  return { url: publicUrl, photos: updated.photos };
}

/** Removes a photo from the space and from Storage. The URL must already
 * be one of this space's own photos, so a caller cannot delete an object
 * belonging to someone else by passing its address. */
export async function removeSpacePhoto(
  organizationId: string,
  spaceId: string,
  url: string
): Promise<{ photos: string[] }> {
  const space = await prisma.space.findFirst({ where: { id: spaceId, organizationId } });
  if (!space) throw new NotFoundError("Space not found");
  if (!space.photos.includes(url)) throw new NotFoundError("Photo not found");

  const updated = await prisma.space.update({
    where: { id: spaceId },
    data: { photos: space.photos.filter((p) => p !== url) },
  });

  const marker = `/${PHOTO_BUCKET}/`;
  const objectPath = url.includes(marker) ? url.slice(url.indexOf(marker) + marker.length) : null;
  if (objectPath) {
    const supabase = createSupabaseAdminClient();
    // Best effort: the row is already updated, and a leftover object is
    // preferable to a listing that still points at a deleted file.
    await supabase.storage.from(PHOTO_BUCKET).remove([decodeURIComponent(objectPath)]);
  }

  await recordAudit({ event: "space.photo_removed", organizationId, metadata: { spaceId } });

  return { photos: updated.photos };
}
