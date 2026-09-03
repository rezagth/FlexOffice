import { createSupabaseAdminClient } from "@/server/auth/supabase-admin";
import { logError } from "@/server/lib/logger";

/**
 * Storage for property and space photos — public, by design: a published
 * listing's photos are meant to be seen by anyone. This is the opposite of
 * `verification/storage.ts`'s private bucket, and the two must never be
 * mixed: reads here use `getPublicUrl()`, never a signed URL, and nothing
 * KYC-shaped belongs in this bucket.
 *
 * `space-photos` already existed (Phase 1/2, created by hand in the
 * Supabase dashboard, no bucket-ensure step). This module adds one anyway
 * (`ensurePhotoBucketExists()`, mirroring `verification/storage.ts`) so a
 * fresh project self-heals instead of failing every upload with an opaque
 * Storage error, and reuses the SAME bucket for property photos under a
 * `properties/` prefix — one public bucket, two prefixes, not two buckets:
 * both kinds of photo have the identical trust level (public, landlord-
 * uploaded, moderated the same way), so a second bucket would buy nothing.
 */
export const PHOTO_BUCKET = "space-photos";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS_PER_ENTITY = 20;

type SniffedType = { mimeType: "image/jpeg" | "image/png" | "image/webp"; extension: string };

/**
 * Identifies an image from its actual bytes, never from the browser's
 * claimed `file.type` alone — the same policy as
 * `verification/storage.ts#sniffFileType`, extended with WebP's signature
 * (`RIFF????WEBP`, not a contiguous prefix). Callers should additionally
 * reject a mismatch between this and the browser-claimed type.
 */
export function sniffFileType(bytes: Uint8Array): SniffedType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= PNG.length && PNG.every((b, i) => bytes[i] === b)) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mimeType: "image/webp", extension: "webp" };
  }
  return null;
}

/**
 * Builds the object's Storage key. Server-generated, from ids alone — never
 * from the filename the caller supplied. `scope` and `ownerId` (the
 * property id, or the space id) form the prefix a future audit or policy
 * reasons about; the shared bucket is why `scope` has to be part of the
 * path rather than implicit.
 */
export function buildPhotoStoragePath(
  scope: "properties" | "spaces",
  ownerId: string,
  photoId: string,
  extension: string
): string {
  return `${scope}/${ownerId}/${photoId}.${extension}`;
}

let bucketEnsured: Promise<void> | null = null;

/** Creates the bucket if missing, memoized — see the doc comment on
 * `ensureVerificationBucketExists()` for why this pattern resets itself on
 * failure rather than wedging every future upload. */
export function ensurePhotoBucketExists(): Promise<void> {
  if (!bucketEnsured) {
    bucketEnsured = (async () => {
      const supabase = createSupabaseAdminClient();
      const { data: existing } = await supabase.storage.getBucket(PHOTO_BUCKET);
      if (existing) return;

      const { error } = await supabase.storage.createBucket(PHOTO_BUCKET, {
        public: true,
        fileSizeLimit: MAX_PHOTO_BYTES,
      });
      if (error && !/already exists/i.test(error.message)) {
        throw error;
      }
    })().catch((error) => {
      bucketEnsured = null;
      throw error;
    });
  }
  return bucketEnsured;
}

export async function uploadPhotoObject(
  path: string,
  bytes: ArrayBuffer,
  contentType: string
): Promise<void> {
  await ensurePhotoBucketExists();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
}

export function getPublicPhotoUrl(path: string): string {
  const supabase = createSupabaseAdminClient();
  const {
    data: { publicUrl },
  } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return publicUrl;
}

/** Best effort: called after the DB row is already gone, so a failure here
 * leaves an orphaned object rather than a listing pointing at a deleted
 * one — the safer of the two inconsistent states. Logged, never thrown,
 * so a Storage hiccup does not turn a successful deletion into an error
 * response. */
export async function deletePhotoObject(path: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  if (error) {
    logError({ event: "media.photo_object_delete_failed", error, storage_path: path });
  }
}
