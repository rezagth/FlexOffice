import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { createSupabaseAdminClient } from "@/server/auth/supabase-admin";
import { VERIFICATION_BUCKET } from "@/server/domains/verification/storage";
import { logError, logEvent } from "@/server/lib/logger";

/**
 * Retention periods (SEC-10). Personal data is kept for as long as its
 * purpose needs it, then removed — not "forever by default".
 *
 *   webhook payloads   90 days. The row (provider event id, type, date)
 *                      stays: it is the idempotency ledger. The payload is
 *                      a full Stripe object — names, e-mails, card country,
 *                      billing address — and is only useful for debugging a
 *                      recent event.
 *   search events      13 months, the CNIL's reference duration for audience
 *                      measurement. Already anonymous; kept bounded anyway.
 *   KYC documents      12 months after the dossier was decided (approved,
 *                      rejected or expired), or past an explicit
 *                      `retentionUntil`. The file is deleted from the
 *                      private bucket; the row stays, marked `purgedAt`, so
 *                      the dossier's history (what was provided, when, what
 *                      was decided) survives without the identity document.
 *
 * These are product decisions to be confirmed by the owner (see the lot A
 * report); they live here as constants so changing one is a one-line diff.
 */
export const WEBHOOK_PAYLOAD_RETENTION_DAYS = 90;
export const SEARCH_EVENT_RETENTION_MONTHS = 13;
export const KYC_DOCUMENT_RETENTION_MONTHS = 12;

/** Label written over a purged document's display name — the original can
 * itself be personal data ("CNI_Jean_Dupont.pdf"). */
export const PURGED_FILENAME = "document-supprime";

const STORAGE_BATCH_SIZE = 100;

function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/**
 * Deletes the Storage objects of every not-yet-purged verification document
 * matching `where`, then marks the rows. Storage first, rows second: a row
 * is only ever marked purged once its object is really gone, so a failure
 * part-way leaves the remainder for the next run instead of lying about it.
 *
 * Throws on a Storage error — callers decide whether that aborts their flow
 * (account erasure does) or is logged and retried later (the daily purge).
 */
export async function purgeVerificationDocuments(
  where: Prisma.VerificationDocumentWhereInput,
  now: Date = new Date()
): Promise<number> {
  const documents = await prisma.verificationDocument.findMany({
    where: { AND: [where, { purgedAt: null }] },
    select: { id: true, storagePath: true },
  });
  if (documents.length === 0) return 0;

  const storage = createSupabaseAdminClient().storage.from(VERIFICATION_BUCKET);
  let purged = 0;
  for (let i = 0; i < documents.length; i += STORAGE_BATCH_SIZE) {
    const batch = documents.slice(i, i + STORAGE_BATCH_SIZE);
    const { error } = await storage.remove(batch.map((doc) => doc.storagePath));
    if (error) throw error;

    const result = await prisma.verificationDocument.updateMany({
      where: { id: { in: batch.map((doc) => doc.id) }, purgedAt: null },
      data: { purgedAt: now, originalFilename: PURGED_FILENAME },
    });
    purged += result.count;
  }
  return purged;
}

type StepResult = number | null;

async function step(name: string, run: () => Promise<number>): Promise<StepResult> {
  try {
    return await run();
  } catch (error) {
    logError({ event: "gdpr.retention_step_failed", step: name, error });
    return null;
  }
}

/**
 * The scheduled retention purge, called from runBookingMaintenance (the
 * existing internal cron). Never throws: each step is independent, a failed
 * step is logged and simply retried on the next run, and a failure here must
 * never stop booking maintenance.
 */
export async function purgeExpiredPersonalData(now: Date = new Date()) {
  const webhookCutoff = new Date(now.getTime() - WEBHOOK_PAYLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const searchCutoff = monthsAgo(now, SEARCH_EVENT_RETENTION_MONTHS);
  const kycCutoff = monthsAgo(now, KYC_DOCUMENT_RETENTION_MONTHS);

  const webhookPayloadsCleared = await step("webhook_payloads", () =>
    prisma.$executeRaw`
      UPDATE "webhook_events"
         SET "payload" = '{}'::jsonb
       WHERE "processed_at" < ${webhookCutoff}
         AND "payload" <> '{}'::jsonb`
  );

  const searchEventsDeleted = await step("search_events", async () => {
    const result = await prisma.searchEvent.deleteMany({ where: { createdAt: { lt: searchCutoff } } });
    return result.count;
  });

  const kycDocumentsPurged = await step("kyc_documents", () =>
    purgeVerificationDocuments(
      {
        OR: [
          { retentionUntil: { lt: now } },
          {
            verification: {
              status: { in: ["APPROVED", "REJECTED", "EXPIRED"] },
              OR: [
                { reviewedAt: { lt: kycCutoff } },
                // An expiry is not a review: no reviewedAt, so fall back to
                // the last change of the dossier.
                { reviewedAt: null, updatedAt: { lt: kycCutoff } },
              ],
            },
          },
        ],
      },
      now
    )
  );

  const result = { webhookPayloadsCleared, searchEventsDeleted, kycDocumentsPurged };
  logEvent({ event: "gdpr.retention_run", ...result });
  return result;
}
