import { createSupabaseAdminClient } from "@/server/auth/supabase-admin";
import { prisma } from "@/server/db/prisma";
import { recordAudit } from "@/server/lib/audit";
import { ConflictError, ValidationError } from "@/server/lib/errors";
import { logError } from "@/server/lib/logger";
import { createInAppNotification } from "@/server/domains/notifications/in-app";
import {
  buildAttestationStoragePath,
  DOMICILIATION_BUCKET,
  ensureDomiciliationBucketExists,
  MAX_ATTESTATION_BYTES,
  sanitizeOriginalFilename,
  sniffFileType,
} from "./domiciliation-storage";

/**
 * PRD V1.1, 2B, R53-R58, S11 — domiciliation requests and the single
 * MakomSpace-offer switch.
 */

const SETTINGS_ID = 1;

/** S11 — read before ever honoring a client-submitted `kind: "MAKOMSPACE"`. */
export async function isDomiciliationOfferEnabled(): Promise<boolean> {
  const settings = await prisma.domiciliationSettings.findUnique({ where: { id: SETTINGS_ID } });
  return settings?.offerEnabled ?? false;
}

/**
 * Admin-only (enforced by the caller route, requireAdmin()). Deliberately
 * no second "legal sign-off confirmed" flag — the PRD asks for a warning on
 * the admin screen, not a second gate this codebase cannot verify the truth
 * of either way. See DomiciliationSettings's own doc comment.
 */
export async function setDomiciliationOfferEnabled(actorUserId: string, enabled: boolean): Promise<void> {
  await prisma.domiciliationSettings.update({
    where: { id: SETTINGS_ID },
    data: { offerEnabled: enabled, updatedByProfileId: actorUserId },
  });
  await recordAudit({
    event: "domiciliation.offer_setting_changed",
    actorUserId,
    organizationId: null,
    metadata: { offerEnabled: enabled },
  });
}

export async function getLatestDomiciliationRequest(organizationId: string) {
  return prisma.domiciliationRequest.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}

/** The admin screen's one list — every request, newest first. Low expected
 * volume (one company-level decision, not a per-booking record), so no
 * pagination yet; add it the day this actually needs it. */
export async function listDomiciliationRequestsForAdmin() {
  return prisma.domiciliationRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: { organization: { select: { id: true, name: true } } },
  });
}

/**
 * Creates a new request — or rather, a new ROW: like LandlordVerification,
 * "the latest one" is authoritative, so an organization changing its answer
 * later just adds another row rather than mutating the old one (the old
 * one's audit trail stays intact).
 *
 * `kind: "MAKOMSPACE"` is re-checked against `isDomiciliationOfferEnabled()`
 * here, server-side — never trusted from the caller alone, even though the
 * UI that calls this already hides the option when disabled.
 */
export async function createDomiciliationRequest(params: {
  organizationId: string;
  actorUserId: string;
  kind: "MAKOMSPACE" | "THIRD_PARTY";
  domiciliataireName?: string;
  domiciliationAddress?: string;
  domiciliationCity?: string;
  domiciliationPostalCode?: string;
}) {
  if (params.kind === "MAKOMSPACE" && !(await isDomiciliationOfferEnabled())) {
    throw new ValidationError(
      "L'offre de domiciliation MakomSpace n'est pas disponible pour le moment."
    );
  }

  const request = await prisma.domiciliationRequest.create({
    data: {
      organizationId: params.organizationId,
      kind: params.kind,
      // THIRD_PARTY is self-declared, nothing for MakomSpace to review or be
      // liable for — see the model's own doc comment in schema.prisma.
      status: params.kind === "MAKOMSPACE" ? "REQUESTED" : "ACCEPTED",
      domiciliataireName: params.kind === "THIRD_PARTY" ? params.domiciliataireName : null,
      address: params.kind === "THIRD_PARTY" ? params.domiciliationAddress : null,
      city: params.kind === "THIRD_PARTY" ? params.domiciliationCity : null,
      postalCode: params.kind === "THIRD_PARTY" ? params.domiciliationPostalCode : null,
      requestedByProfileId: params.actorUserId,
    },
  });

  await recordAudit({
    event: "domiciliation.requested",
    actorUserId: params.actorUserId,
    organizationId: params.organizationId,
    metadata: { requestId: request.id, kind: params.kind },
  });

  return request;
}

const STATUS_LABELS_FOR_NOTIFICATION: Record<string, string> = {
  REQUESTED: "en attente de traitement",
  IN_PROGRESS: "en cours de traitement",
  ACCEPTED: "acceptée",
  REFUSED: "refusée",
};

/** Admin-only (enforced by the caller route). Applies to either kind — a
 * THIRD_PARTY declaration can still be moved to REFUSED if the attestation
 * looks wrong, same action either way. */
export async function changeDomiciliationRequestStatus(
  actorUserId: string,
  requestId: string,
  status: "REQUESTED" | "IN_PROGRESS" | "ACCEPTED" | "REFUSED",
  notes: string | undefined
) {
  const request = await prisma.domiciliationRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new ConflictError("Demande introuvable.");

  const updated = await prisma.domiciliationRequest.update({
    where: { id: requestId },
    data: {
      status,
      adminNotes: notes ?? request.adminNotes,
      reviewedByProfileId: actorUserId,
      reviewedAt: new Date(),
    },
  });

  await recordAudit({
    event: "domiciliation.status_changed",
    actorUserId,
    organizationId: request.organizationId,
    metadata: { requestId, status },
  });

  await createInAppNotification({
    recipientProfileId: request.requestedByProfileId,
    type: "DOMICILIATION_STATUS_CHANGED",
    title: "Votre demande de domiciliation a été mise à jour",
    body: `Votre demande de domiciliation est désormais ${STATUS_LABELS_FOR_NOTIFICATION[status]}.`,
    link: "/app/account",
  });

  return updated;
}

/**
 * Uploads the THIRD_PARTY attestation — mirrors
 * verification/documents.ts's uploadVerificationDocument() almost exactly
 * (sniff before trusting the browser's claimed type, upload before the
 * database write, clean up the Storage object if the write then fails), but
 * `upsert: true` and a deterministic path: a re-upload replaces the previous
 * attestation in place rather than accumulating orphans needing their own
 * cleanup, since a request only ever has one "current" attestation.
 */
export async function uploadDomiciliationAttestation(params: {
  requestId: string;
  organizationId: string;
  uploadedByProfileId: string;
  file: File;
}) {
  const { requestId, organizationId, uploadedByProfileId, file } = params;

  if (file.size === 0) throw new ValidationError("Le fichier est vide.");
  if (file.size > MAX_ATTESTATION_BYTES) {
    throw new ValidationError(`Le fichier ne doit pas dépasser ${MAX_ATTESTATION_BYTES / (1024 * 1024)} Mo.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffFileType(bytes);
  if (!sniffed) {
    throw new ValidationError("Format non reconnu. Formats acceptés : PDF, JPEG, PNG.");
  }
  if (file.type !== sniffed.mimeType) {
    throw new ValidationError("Le type de fichier annoncé ne correspond pas au contenu réel du fichier.");
  }

  const storagePath = buildAttestationStoragePath(organizationId, requestId, sniffed.extension);

  await ensureDomiciliationBucketExists();
  const supabase = createSupabaseAdminClient();
  const { error: uploadError } = await supabase.storage
    .from(DOMICILIATION_BUCKET)
    .upload(storagePath, bytes, { contentType: sniffed.mimeType, upsert: true });
  if (uploadError) throw uploadError;

  try {
    const updated = await prisma.domiciliationRequest.update({
      where: { id: requestId },
      data: {
        attestationStoragePath: storagePath,
        attestationOriginalFilename: sanitizeOriginalFilename(file.name),
        attestationMimeType: sniffed.mimeType,
        attestationSizeBytes: file.size,
      },
    });

    await recordAudit({
      event: "domiciliation.attestation_uploaded",
      actorUserId: uploadedByProfileId,
      organizationId,
      metadata: { requestId },
    });

    return updated;
  } catch (error) {
    await supabase.storage
      .from(DOMICILIATION_BUCKET)
      .remove([storagePath])
      .catch((cleanupError) => {
        logError({
          event: "domiciliation.attestation_cleanup_failed",
          error: cleanupError,
          storage_path: storagePath,
        });
      });
    throw error;
  }
}
