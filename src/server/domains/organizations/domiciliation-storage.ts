import { createSupabaseAdminClient } from "@/server/auth/supabase-admin";
import { logError } from "@/server/lib/logger";

/**
 * Storage for domiciliation attestations — a different private bucket from
 * `verification-documents` (verification/storage.ts), on purpose: one
 * misconfigured policy then costs one document category, not two. The
 * sniff/sanitize helpers below are deliberately duplicated rather than
 * imported from verification/storage.ts — small, pure, and keeping each
 * domain's storage module self-contained avoids coupling two otherwise
 * unrelated features together for a few lines of code.
 */
export const DOMICILIATION_BUCKET = "domiciliation-documents";

export const MAX_ATTESTATION_BYTES = 10 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 120;

type SniffedType = { mimeType: "application/pdf" | "image/jpeg" | "image/png"; extension: string };

export const DOMICILIATION_ALLOWED_MIME_TYPES: SniffedType["mimeType"][] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

const MAGIC_SIGNATURES: Array<{ bytes: number[]; mimeType: SniffedType["mimeType"]; extension: string }> = [
  { bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], mimeType: "application/pdf", extension: "pdf" },
  { bytes: [0xff, 0xd8, 0xff], mimeType: "image/jpeg", extension: "jpg" },
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mimeType: "image/png", extension: "png" },
];

/** Never trusts the browser-claimed type alone — see
 * verification/storage.ts's own doc comment, same reasoning here. */
export function sniffFileType(bytes: Uint8Array): SniffedType | null {
  for (const signature of MAGIC_SIGNATURES) {
    if (bytes.length < signature.bytes.length) continue;
    const matches = signature.bytes.every((byte, index) => bytes[index] === byte);
    if (matches) return { mimeType: signature.mimeType, extension: signature.extension };
  }
  return null;
}

export function sanitizeOriginalFilename(name: string): string {
  const base = name
    .replace(/[/\\]/g, "_")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();
  const truncated = base.slice(0, 150);
  return truncated.length > 0 ? truncated : "document";
}

/** Deterministic, one path per request: a re-upload overwrites the previous
 * attestation (there is only ever one "current" attestation per request,
 * unlike verification's multiple documents) rather than accumulating
 * orphaned objects that would need their own cleanup step. */
export function buildAttestationStoragePath(
  organizationId: string,
  domiciliationRequestId: string,
  extension: string
): string {
  return `${organizationId}/${domiciliationRequestId}/attestation.${extension}`;
}

let bucketEnsured: Promise<void> | null = null;

export function ensureDomiciliationBucketExists(): Promise<void> {
  if (!bucketEnsured) {
    bucketEnsured = (async () => {
      const supabase = createSupabaseAdminClient();
      const { data: existing } = await supabase.storage.getBucket(DOMICILIATION_BUCKET);
      if (existing) {
        if (!existing.allowed_mime_types?.length || !existing.file_size_limit) {
          const { error } = await supabase.storage.updateBucket(DOMICILIATION_BUCKET, {
            public: false,
            fileSizeLimit: MAX_ATTESTATION_BYTES,
            allowedMimeTypes: DOMICILIATION_ALLOWED_MIME_TYPES,
          });
          if (error) {
            logError({ event: "storage.bucket_limits_update_failed", error, bucket: DOMICILIATION_BUCKET });
          }
        }
        return;
      }

      const { error } = await supabase.storage.createBucket(DOMICILIATION_BUCKET, {
        public: false,
        fileSizeLimit: MAX_ATTESTATION_BYTES,
        allowedMimeTypes: DOMICILIATION_ALLOWED_MIME_TYPES,
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

export async function createAttestationSignedUrl(storagePath: string): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(DOMICILIATION_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    logError({ event: "domiciliation.signed_url_failed", error, storage_path: storagePath });
    throw error ?? new Error("Failed to create signed URL");
  }
  return data.signedUrl;
}
