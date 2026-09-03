import type { LandlordVerification, VerificationDocumentType } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { createSupabaseAdminClient } from "@/server/auth/supabase-admin";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { logError } from "@/server/lib/logger";
import {
  buildDocumentStoragePath,
  ensureVerificationBucketExists,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS_PER_VERIFICATION,
  sanitizeOriginalFilename,
  sniffFileType,
  VERIFICATION_BUCKET,
} from "./storage";

/**
 * Statuses in which a dossier still accepts document changes.
 *
 * DRAFT and REJECTED are the obvious editable states. PENDING_REVIEW is
 * included too: a caller who realizes they forgot a document before an
 * admin has picked the dossier up should be able to add it without the
 * dossier bouncing back to DRAFT. IN_REVIEW is excluded on purpose — once an
 * admin has taken the dossier in charge, the evidence they are looking at
 * must not change under them. APPROVED and EXPIRED are terminal.
 */
const EDITABLE_STATUSES = new Set(["DRAFT", "PENDING_REVIEW", "REJECTED"]);

function assertEditable(verification: Pick<LandlordVerification, "status">) {
  if (!EDITABLE_STATUSES.has(verification.status)) {
    throw new ConflictError(
      "Ce dossier ne peut plus être modifié dans son état actuel."
    );
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Uploads one document into a dossier.
 *
 * SECURITY CHECKS, IN ORDER — every one of them server-side, none of them
 * trusting anything the browser merely claims:
 *   1. the dossier is in an editable state;
 *   2. the document count is under the cap;
 *   3. the byte size is under the cap and non-zero;
 *   4. the file's actual bytes are sniffed and must match a known signature,
 *      AND agree with the browser-claimed `file.type` — neither is trusted
 *      alone, so a mismatch (a renamed file, a spoofed Content-Type) is
 *      rejected rather than silently resolved one way or the other;
 *   5. `declaredType` (which VerificationDocumentType this is) is only
 *      accepted from the enum — Zod at the route boundary handles that.
 *
 * The storage path is built from ids generated here, never from the
 * uploaded filename — see storage.ts. Upload happens before the database
 * row so a caller never sees a document recorded that Storage does not
 * actually hold; if the database write then fails, the uploaded object is
 * removed rather than left orphaned.
 */
export async function uploadVerificationDocument({
  verification,
  uploadedByProfileId,
  organizationId,
  declaredType,
  file,
}: {
  verification: Pick<LandlordVerification, "id" | "status">;
  uploadedByProfileId: string;
  organizationId: string;
  declaredType: VerificationDocumentType;
  file: File;
}) {
  assertEditable(verification);

  const existingCount = await prisma.verificationDocument.count({
    where: { verificationId: verification.id },
  });
  if (existingCount >= MAX_DOCUMENTS_PER_VERIFICATION) {
    throw new ValidationError(
      `Maximum ${MAX_DOCUMENTS_PER_VERIFICATION} documents par dossier.`
    );
  }

  if (file.size === 0) {
    throw new ValidationError("Le fichier est vide.");
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new ValidationError(
      `Le fichier ne doit pas dépasser ${MAX_DOCUMENT_BYTES / (1024 * 1024)} Mo.`
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffFileType(bytes);
  if (!sniffed) {
    throw new ValidationError(
      "Format non reconnu. Formats acceptés : PDF, JPEG, PNG."
    );
  }
  // The browser's Content-Type is a claim, not a fact — required to agree
  // with what the bytes actually are, so a claim alone can never pass.
  if (file.type !== sniffed.mimeType) {
    throw new ValidationError(
      "Le type de fichier annoncé ne correspond pas au contenu réel du fichier."
    );
  }

  const checksum = await sha256Hex(bytes);
  const documentId = crypto.randomUUID();
  const storagePath = buildDocumentStoragePath(
    organizationId,
    verification.id,
    documentId,
    sniffed.extension
  );

  await ensureVerificationBucketExists();
  const supabase = createSupabaseAdminClient();
  const { error: uploadError } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .upload(storagePath, bytes, { contentType: sniffed.mimeType, upsert: false });
  if (uploadError) throw uploadError;

  try {
    const document = await prisma.verificationDocument.create({
      data: {
        id: documentId,
        verificationId: verification.id,
        type: declaredType,
        storagePath,
        originalFilename: sanitizeOriginalFilename(file.name),
        mimeType: sniffed.mimeType,
        sizeBytes: file.size,
        checksum,
        uploadedByProfileId,
      },
      select: {
        id: true,
        type: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        uploadedAt: true,
      },
    });

    await recordAudit({
      event: "verification.document_uploaded",
      actorUserId: uploadedByProfileId,
      organizationId,
      // Never the filename or the checksum: audit metadata is not the place
      // for anything that could help fingerprint the actual document.
      metadata: { verificationId: verification.id, documentId, documentType: declaredType },
    });

    return document;
  } catch (error) {
    // The DB row failed after the object was already written — remove it
    // rather than leave a Storage object with nothing pointing at it.
    await supabase.storage.from(VERIFICATION_BUCKET).remove([storagePath]).catch((cleanupError) => {
      logError({
        event: "verification.document_cleanup_failed",
        error: cleanupError,
        storage_path: storagePath,
      });
    });
    throw error;
  }
}

/**
 * Removes a document. The id must belong to THIS verification — a caller
 * cannot delete another dossier's document by guessing an id, because the
 * lookup is scoped by `verificationId`, not just `id`.
 */
export async function deleteVerificationDocument({
  verification,
  documentId,
  actorProfileId,
  organizationId,
}: {
  verification: Pick<LandlordVerification, "id" | "status">;
  documentId: string;
  actorProfileId: string;
  organizationId: string;
}) {
  assertEditable(verification);

  const document = await prisma.verificationDocument.findFirst({
    where: { id: documentId, verificationId: verification.id },
  });
  if (!document) {
    throw new NotFoundError("Document introuvable");
  }

  await prisma.verificationDocument.delete({ where: { id: document.id } });

  const supabase = createSupabaseAdminClient();
  // Best effort: the row is already gone, and a leftover object is
  // preferable to letting a Storage failure block the user from retrying.
  await supabase.storage
    .from(VERIFICATION_BUCKET)
    .remove([document.storagePath])
    .catch((error) => {
      logError({
        event: "verification.document_storage_removal_failed",
        error,
        storage_path: document.storagePath,
      });
    });

  await recordAudit({
    event: "verification.document_removed",
    actorUserId: actorProfileId,
    organizationId,
    metadata: { verificationId: verification.id, documentId, documentType: document.type },
  });
}
