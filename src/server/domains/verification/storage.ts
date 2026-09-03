import { createSupabaseAdminClient } from "@/server/auth/supabase-admin";
import { logError } from "@/server/lib/logger";

/**
 * Storage for verification documents — a CNI, a Kbis, a proof of ownership.
 *
 * PRIVATE, AND SEPARATE FROM THE PUBLIC PHOTO BUCKET
 * `space-photos` (Phase 2) is public-read by design: a published listing's
 * photos are meant to be seen by anyone. A verification document is the
 * opposite — it must never be reachable by URL, public or guessable. Using
 * one bucket for both would mean one misconfigured policy away from leaking
 * identity documents. They are therefore two buckets, and this module never
 * calls `getPublicUrl()`: every read goes through `createSignedUrl()`, which
 * requires the service-role key this module holds and expires quickly.
 *
 * "Reachable only by knowing the path" is not privacy. A bucket with
 * `public: false` still refuses an unsigned request even if the exact path
 * leaked (a log line, a browser history entry, a referrer header) — that is
 * the property this buys, not obscurity.
 */
export const VERIFICATION_BUCKET = "verification-documents";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_VERIFICATION = 12;

/** Seconds a signed URL stays valid. Short: it is regenerated on demand by
 * an authorized viewer, never cached or emailed. */
export const SIGNED_URL_TTL_SECONDS = 120;

type SniffedType = { mimeType: "application/pdf" | "image/jpeg" | "image/png"; extension: string };

const MAGIC_SIGNATURES: Array<{ bytes: number[]; mimeType: SniffedType["mimeType"]; extension: string }> = [
  { bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], mimeType: "application/pdf", extension: "pdf" },
  { bytes: [0xff, 0xd8, 0xff], mimeType: "image/jpeg", extension: "jpg" },
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mimeType: "image/png", extension: "png" },
];

/**
 * Identifies a file type from its actual bytes, never from the browser's
 * claimed `file.type` alone — a renamed `.exe` reports whatever Content-Type
 * the uploader's browser feels like sending. Returns `null` for anything that
 * does not match one of the three signatures this platform accepts.
 *
 * Callers should additionally compare the result against the browser-claimed
 * type and reject a mismatch outright: agreement between the two is what
 * makes a false claim harder to construct than getting either one wrong.
 */
export function sniffFileType(bytes: Uint8Array): SniffedType | null {
  for (const signature of MAGIC_SIGNATURES) {
    if (bytes.length < signature.bytes.length) continue;
    const matches = signature.bytes.every((byte, index) => bytes[index] === byte);
    if (matches) return { mimeType: signature.mimeType, extension: signature.extension };
  }
  return null;
}

/**
 * Builds the object's Storage key. Server-generated, from ids alone — never
 * from the filename the caller supplied, which is exactly the input a path
 * traversal or a collision attack would try to control. The organization
 * prefix is what a signed-URL policy or a future audit can reason about.
 */
export function buildDocumentStoragePath(
  organizationId: string,
  verificationId: string,
  documentId: string,
  extension: string
): string {
  return `${organizationId}/${verificationId}/${documentId}.${extension}`;
}

/**
 * Strips a filename to something safe to store and display. Used ONLY for
 * `originalFilename` — a display label — never for the storage path or any
 * other identifier. Rejects path separators and control characters, and
 * caps the length so a pathological name cannot bloat a response.
 */
export function sanitizeOriginalFilename(name: string): string {
  const base = name
    .replace(/[/\\]/g, "_")
    // Control bytes stripped on purpose — this project's lint config does
    // not flag no-control-regex, so no directive is needed here.
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();
  const truncated = base.slice(0, 150);
  return truncated.length > 0 ? truncated : "document";
}

let bucketEnsured: Promise<void> | null = null;

/**
 * Creates the private bucket if it does not exist yet. Memoized so this only
 * ever hits Storage once per server process — every upload after the first
 * skips straight past it.
 *
 * No such step existed for `space-photos`, which assumes the bucket was
 * created by hand in the Supabase dashboard. That is an undocumented manual
 * step this module does not want to repeat: a verification bucket that is
 * missing on a fresh project should fix itself on first use rather than fail
 * every upload with an opaque Storage error.
 */
export function ensureVerificationBucketExists(): Promise<void> {
  if (!bucketEnsured) {
    bucketEnsured = (async () => {
      const supabase = createSupabaseAdminClient();
      const { data: existing } = await supabase.storage.getBucket(VERIFICATION_BUCKET);
      if (existing) return;

      const { error } = await supabase.storage.createBucket(VERIFICATION_BUCKET, {
        public: false,
        fileSizeLimit: MAX_DOCUMENT_BYTES,
      });
      // A concurrent request may have created it first; Storage reports that
      // as an error this module can safely ignore.
      if (error && !/already exists/i.test(error.message)) {
        throw error;
      }
    })().catch((error) => {
      // Reset so the NEXT call retries instead of a transient failure
      // permanently wedging every future upload for the life of the process.
      bucketEnsured = null;
      throw error;
    });
  }
  return bucketEnsured;
}

/**
 * A short-lived, single-use-in-spirit URL to read one document.
 *
 * Never returned to a caller this module has not already authorized — see
 * `requireVerificationAccess()` in access.ts, which every route calls before
 * reaching here.
 */
export async function createSignedDocumentUrl(storagePath: string): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    logError({ event: "verification.signed_url_failed", error, storage_path: storagePath });
    throw error ?? new Error("Failed to create signed URL");
  }
  return data.signedUrl;
}
